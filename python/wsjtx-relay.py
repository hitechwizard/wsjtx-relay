#!/usr/bin/env python3
"""
WSJT-X Relay

Listens on localhost:<listenport> (default 2237) and relays any incoming UDP packets
to the configured forward address:port pairs.

Packets received from a configured forward endpoint are relayed back to the
original sender(s) that caused the forward to be contacted (per-forward mapping
with expiration).

Usage:
  python3 wsjtx-relay.py [-l LISTEN_PORT] host1:port1 host2:port2 ...

Example:
  python3 wsjtx-relay.py -l 2237 127.0.0.1:2238 192.168.1.10:5000 10.0.0.20:6000

"""

from __future__ import annotations

import argparse
import ipaddress
import selectors
import signal
import socket
import sys
import time
from collections import defaultdict
from typing import Tuple, Dict

from pyhamtools.frequency import freq_to_band
from wsjtx_srv.wsjtx import WSJTX_Telegram, WSJTX_Close, WSJTX_Decode, WSJTX_Status, WSJTX_QSO_Logged, WSJTX_Logged_ADIF, WSJTX_Heartbeat, WSJTX_Reply, WSJTX_Highlight_Call, QColor

CLIENT_TIMEOUT = 60.0  # seconds to remember client -> forward mapping
RECV_BUFSIZE = 65535

Address = Tuple[str, int]


def valid_port(p: int) -> bool:
    return 1 <= p <= 65535


def parse_forward(s: str) -> Address:
    try:
        host, port_str = s.rsplit(":", 1)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid forward format: '{s}', expected ip:port")

    try:
        port = int(port_str)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid port in '{s}'")

    if not valid_port(port):
        raise argparse.ArgumentTypeError(f"port out of range in '{s}'")

    # Require IPv4 literal
    try:
        ipaddress.IPv4Address(host)
    except ipaddress.AddressValueError:
        raise argparse.ArgumentTypeError(f"invalid IPv4 address in '{s}'")

    return host, port


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simple UDP relay (localhost only listener).")
    parser.add_argument(
        "-l",
        "--listen-port",
        type=int,
        default=2237,
        help="Port to listen on localhost (default: 2237)",
    )
    parser.add_argument(
        "forwards",
        metavar="host:port",
        type=parse_forward,
        nargs="+",
        help="One or more forward endpoints (IPv4:port)",
    )

    args = parser.parse_args()

    if not valid_port(args.listen_port):
        parser.error("listen port must be 1-65535")

    return args


def now_ts() -> float:
    return time.time()


def decode_payload(data:bytes) -> None:
    tel = WSJTX_Telegram.from_bytes(data)
    if isinstance(tel, WSJTX_Close):
        print("Closed")
    elif isinstance(tel, WSJTX_Heartbeat):
        print("Heartbeat")
    elif isinstance(tel, WSJTX_Status):
        freq = tel.dial_frq/1000000
        band = freq_to_band(freq*1000)["band"]
        print(f"Status: ", end="")
        if tel.xmitting:
           print(f"Transmitting: {tel.tx_message.strip()} on ", end="")
        print(f"freq: {freq} band: {band} mode: {tel.mode}")
    elif isinstance(tel, WSJTX_Decode):
        print(f"Decode: {tel.message}")
    elif isinstance(tel, WSJTX_QSO_Logged):
        print(f"QSO Logged: {tel.dx_call}")
    elif isinstance(tel, WSJTX_Logged_ADIF):
        print(f"ADIF Information:")
        print(tel.adif_txt)
    elif isinstance(tel, WSJTX_Reply):
        print(f"Reply: {tel.message}")
    else:
        print(f"Telegram: {type(tel)}: {tel}")


def log(msg: str, end:str = "") -> None:
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {msg}", end=end)


def run_relay(listen_port: int, forwards: Dict[Address, None]) -> None:
    # cast forwards to a list
    forward_list = list(forwards)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", listen_port))
    sock.setblocking(False)

    sel = selectors.DefaultSelector()
    sel.register(sock, selectors.EVENT_READ)

    # mapping: forward_addr -> dict(client_addr -> last_seen_ts)
    mapping: Dict[Address, Dict[Address, float]] = defaultdict(dict)

    running = True

    def _signal_handler(signum, frame):
        nonlocal running
        log(f"Signal {signum} received, stopping", "\n")
        running = False

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    log(f"Listening on 127.0.0.1:{listen_port}, forwarding to: {', '.join(f'{h}:{p}' for h,p in forward_list)}", "\n")

    try:
        while running:
            events = sel.select(timeout=1.0)
            # periodic cleanup
            cutoff = now_ts() - CLIENT_TIMEOUT
            for fwd in list(mapping.keys()):
                clients = mapping[fwd]
                for c in list(clients.keys()):
                    if clients[c] < cutoff:
                        del clients[c]
                if not clients:
                    # remove empty forward mapping
                    del mapping[fwd]

            if not events:
                continue

            for key, mask in events:
                if key.fileobj is sock:
                    try:
                        data, src = sock.recvfrom(RECV_BUFSIZE)
                    except BlockingIOError:
                        continue

                    if not data:
                        continue

                    # src is a tuple (ip, port)
                    if src in forward_list:
                        # packet from one of the forwards -> send back to mapped clients
                        clients = mapping.get(src)
                        if clients:
                            log(f"{src[0]}:{src[1]} -> ")
                            for client in list(clients.keys()):
                                try:
                                    sock.sendto(data, client)
                                    print(f"{client[0]}:{client[1]} ", end="")
                                except Exception as e:
                                    log(f"Error sending to client {client}: {e} ")
                                print(f"({len(data)} bytes) ", end="")
                        else:
                            log(f"{src[0]}:{src[1]} -> <no-mapping> (dropped) ({len(data)} bytes) ")
                        decode_payload(data)
                    else:
                        # packet from client -> forward to all forwards, store mapping
                        log(f"{src[0]}:{src[1]} -> ")
                        for fwd in forward_list:
                            try:
                                sock.sendto(data, fwd)
                                mapping[fwd][src] = now_ts()
                                print(f"{fwd[0]}:{fwd[1]} ", end="")
                            except Exception as e:
                                log(f"Error sending to forward {fwd}: {e} ")
                        print(f"({len(data)} bytes) ", end="")
                        decode_payload(data)

    finally:
        sel.unregister(sock)
        sock.close()
        log("Stopped", "\n")


def main() -> None:
    args = parse_args()
    if not args.forwards:
        print("At least one forward endpoint must be specified.")
        sys.exit(2)

    # args.forwards is a list of Address tuples
    forwards = {f: None for f in args.forwards}

    run_relay(args.listen_port, forwards)


if __name__ == "__main__":
    main()
