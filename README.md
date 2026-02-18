# wsjtx-relay

When you need WSJT-X to notify more than one application via UDP, like GridTracker, openHamclock, WRL CAT Control, N1MM+, N3FJP, etc. WSJTX-Relay is the middle man allowing bi-directional traffic between WSJT-X and all the forwards.

That was the python script... and then I was thinking, wouldn't it be nice to be able to enter QSOs manually, like if you were doing a POTA activation and wanted to do some SSB or CW as well. Just a few more features to complete and it will be ready to go.

# Features to finish:
- Calculate current QSOs per hour
- Export QSO log to ADIF (for upload to POTA)
- Store & Forward QSOs - some apps need to be internet connected when they receive the QSO. This option will hold them until you're ready
- Resend QSO - if the forward app wasn't ready for the QSO (like WRL CAT Control not listening) it will let you resend the QSO.