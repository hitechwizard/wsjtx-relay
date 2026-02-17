// Derived from: PU3IKE - HEnrique B. Gravina
// License - GPL2
// 15/02/2021
// WSJT-X networkMessages
// https://sourceforge.net/p/wsjt/wsjtx/ci/master/tree/NetworkMessage.hpp#l419

const { AdiReader } = require('./adif/AdiReader');

class WsjtxUdpParser {

    MESSAGE_TYPES = {
        0: "Heartbeat",
        1: "Status",
        2: "Decode",
        3: "Clear",
        4: "Reply",
        5: "QSO Logged",
        6: "Closed",
        7: "Replay",
        8: "Halt TX",
        9: "Free Text",
        10: "WSPR Decode",
        11: "Location",
        12: "Logged ADIF",
        13: "Highlight Call",
        14: "Switch Config",
        15: "Configure",
    }

    constructor(dataBuffer){
        if(dataBuffer.readUInt32BE(0) !== 0xADBCCBDA) throw new Error('No Magic Number')
        
        this.data = dataBuffer

        // common to all messages
        this.offset = 4 // 4 Bytes of magic number

        this.version = this.getUint32FromData(this.data,this.offset)
        this.type = this.getUint32FromData(this.data,this.offset)
        this.typeText = this.MESSAGE_TYPES[this.type] || 'Unknown';     
        this.id = this.getStringUtf8FromData(this.data,this.offset)
        
        // Get status message
        switch (parseInt(this.type)) {
            case 1:
                this.parseStatusMessage();
                break;
            case 2:
                this.parseDecodeMessage();
                break;
            case 5:
                this.parseQSOLoggedMessage();
                break;
            case 10:
                this.parseWSPRMessage();
                break;
            case 12:
                this.parseADIFMessage();
                break;
        }
    }

    parseStatusMessage() {
        this.dialFrequency = this.getUint64FromData(this.data,this.offset);
        this.mode = this.getStringUtf8FromData(this.data,this.offset);
        this.dxcall = this.getStringUtf8FromData(this.data,this.offset);
        this.report = this.getStringUtf8FromData(this.data,this.offset);
        this.txMode = this.getStringUtf8FromData(this.data,this.offset);
        this.txEnabled = this.getBoolFromData(this.data,this.offset);
        this.transmitting = this.getBoolFromData(this.data,this.offset);
        this.decoding = this.getBoolFromData(this.data,this.offset);
        this.rxDf = this.getUint32FromData(this.data,this.offset);
        this.txDf = this.getUint32FromData(this.data,this.offset);
        this.deCall = this.getStringUtf8FromData(this.data,this.offset);
        this.deGrid = this.getStringUtf8FromData(this.data,this.offset);
        this.dxGrid = this.getStringUtf8FromData(this.data,this.offset);
        this.txWatchdog = this.getBoolFromData(this.data,this.offset);
        this.subMode = this.getStringUtf8FromData(this.data,this.offset);
        this.fastMode = this.getBoolFromData(this.data,this.offset);
        this.specialOperationMode = this.getUint8FromData(this.data,this.offset);
        //0 -> NONE
        // 1 -> NA VHF
        //2 -> EU VHF
        //3 -> FIELD DAY
        //4 -> RTTY RU
        //5 -> WW DIGI
        //6 -> FOX
        //7 -> HOUND
        this.frquencyToalrance = this.getUint32FromData(this.data,this.offset);
        this.trPeriod = this.getUint32FromData(this.data,this.offset);
        this.configurationName = this.getStringUtf8FromData(this.data,this.offset);
        try {
            this.txMessage = this.getStringUtf8FromData(this.data,this.offset);
        }catch (e) {
            //console.log(e);
        };
    }

    parseDecodeMessage() {
        this.new = this.getInt8FromData(this.data,this.offset);
        this.time = this.getUint32FromData(this.data,this.offset);
        this.time_utc = this.getUTCTime(this.time);
        this.snr = this.getInt32FromData(this.data,this.offset);
        this.delta_time = this.getDoubleFromData(this.data,this.offset);
        this.delta_freq = this.getUint32FromData(this.data,this.offset);
        this.mode = this.getStringUtf8FromData(this.data,this.offset);
        this.message = this.getStringUtf8FromData(this.data,this.offset);
        this.lowconfidence = this.getInt8FromData(this.data,this.offset);
        this.offair = this.getInt8FromData(this.data,this.offset);
    }  

    parseQSOLoggedMessage() {
        // Date Time off (TODO)
        this.dateOff = this.getUint64FromData(this.data,this.offset);
        this.timeOff = this.getUint32FromData(this.data,this.offset);
        this.timespecOff = this.getUint8FromData(this.data,this.offset);
        if (this.timespecOff == 2) {
            this.offsetOff = this.getInt32FromData(this.data,this.offset);
        }
        this.dxCall = this.getStringUtf8FromData(this.data,this.offset);
        this.dxGrid = this.getStringUtf8FromData(this.data,this.offset);
        this.dialFrequency = this.getUint64FromData(this.data,this.offset);
        this.mode = this.getStringUtf8FromData(this.data,this.offset);
        this.rstSent = this.getStringUtf8FromData(this.data,this.offset);
        this.rptRcvd = this.getStringUtf8FromData(this.data,this.offset);
        this.txPwr = this.getStringUtf8FromData(this.data,this.offset);
        this.comments = this.getStringUtf8FromData(this.data,this.offset);
        this.name = this.getStringUtf8FromData(this.data,this.offset);

        this.dateOn = this.getUint64FromData(this.data,this.offset);
        this.timeOn = this.getUint32FromData(this.data,this.offset);
        this.timespecOn = this.getUint8FromData(this.data,this.offset);
        if (this.timespecOn == 2) {
            this.offsetOn = this.getInt32FromData(this.data,this.offset);
        }
        this.operator = this.getStringUtf8FromData(this.data,this.offset);
        this.deCall = this.getStringUtf8FromData(this.data,this.offset);
        this.deGrid = this.getStringUtf8FromData(this.data,this.offset);
        this.exchangeSent = this.getStringUtf8FromData(this.data,this.offset);
        this.exchangeRcvd = this.getStringUtf8FromData(this.data,this.offset);
    }

    parseWSPRMessage() {
        this.new = this.getInt8FromData(this.data,this.offset);
        this.time = this.getUint32FromData(this.data,this.offset);
        this.utc_time = getUTCTime(this.time);
        this.snr = this.getUint32FromData(this.data,this.offset);
        this.delta_time = this.getDoubleFromData(this.data,this.offset);
        this.freq = this.getUint64FromData(this.data,this.offset);
        this.drift = this.getInt32FromData(this.data,this.offset);
        this.callsign = this.getStringUtf8FromData(this.data,this.offset);
        this.grid = this.getStringUtf8FromData(this.data,this.offset);
        this.power = this.getInt32FromData(this.data,this.offset);
        this.offair = this.getInt8FromData(this.data,this.offset);
    }

    // Get adif from Log QSO of WSJT-X
    parseADIFMessage() {
        this.adif = this.getStringUtf8FromData(this.data,this.offset)
        const adifReader = new AdiReader(this.adif);
        this.adifData = adifReader.readAll()
    }

    // Functions to processs bytes from QStream
    
    getInt8FromData(data,offset){
        let var_int8  = data.readInt8(offset) // 1Byte long
        this.offset = offset + 1
        return var_int8
    }

    getUint8FromData(data,offset){
        let var_uint8 = data.readUint8(offset) // 1Byte long
        this.offset = offset + 1
        return var_uint8
    }

    getBoolFromData(data,offset){
        let out_bool = this.getInt8FromData(data,offset)
        if(out_bool < 1) return false
        else return true
    }

    getInt32FromData(data,offset){
        let var_int32 = data.readInt32BE(offset) // 4 ByteLong
        this.offset = offset + 4
        return var_int32
    }
    getUint32FromData(data,offset){
        let var_uint32 = this.data.readUInt32BE(offset)
        this.offset = offset + 4.
        return var_uint32
    }

    getInt64FromData(data,offset){
        let var_int64 = data.readBigInt64BE(offset) // 8 ByteLong
        this.offset = offset + 8
        return var_int64
    }

    getUint64FromData(data,offset){
        let var_uint64 = data.readBigUInt64BE(offset)
        this.offset = offset + 8
        return var_uint64
    }
    getDoubleFromData(data,offset){
        let var_double = data.readDoubleBE(offset)
        this.offset = offset + 8 
        return var_double
    }
    // This function could be simpler, but I get some troble with FFFFF and non existing "fields"
    getStringUtf8FromData(data,offset){
        //DX call                utf8 = Variabel lenght
        let string_utf8_size = data.readUInt32BE(offset) // 4 byte long
        if(string_utf8_size < 1){
            this.offset = offset + 4
            return null
        }
        else if(string_utf8_size > 1000){
             this.offset = offset + 4
             return null
        }else{
            offset = offset + 4
            // Get string
            let string_utf8 = data.toString('utf8',offset, offset + string_utf8_size)
            this.offset = offset + string_utf8_size
            return string_utf8
        }
    }

    getUTCTime(time) {
        // Convert time from miliseconds from midnight to UTC
        let time_seconds = time / 1000
        let hours = Math.floor(time_seconds / 60 / 60);
        let minutes = Math.floor(time_seconds / 60 ) - (hours * 60);
        let seconds = time_seconds % 60;
        //Format linke wsjt-x software
        return hours.toString().padStart(2, '0') + minutes.toString().padStart(2, '0') + seconds.toString().padStart(2, '0');        
    }

}
  
module.exports = { WsjtxUdpParser }