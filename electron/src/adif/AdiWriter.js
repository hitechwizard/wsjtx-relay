const dateformat = require("dateformat");
const fields = require("./fields");

class AdiWriter {
  constructor(programid, programversion) {
    this.data = "# node-adif export\n";
    this.writeField("adif_ver", "3.0.4");
    this.writeField("programid", programid || "node-adif");
    if (programversion) this.writeField("programversion", programversion);
    this.data += "<EOH>\n\n";
  }

  getData() {
    return this.data;
  }

  writeAll(contacts) {
    for (let i = 0; i < contacts.length; i++) {
      this.writeContact(contacts[i]);
    }

    return this.data;
  }

  writeFldigiLine(contact) {
    this.data = "";

    for (const key in contact) {
      this.writeProperty(key, contact[key]);
    }
    this.data += "<EOR>";

    return this.data;
  }

  writeContact(contact) {
    for (const key in contact) {
      this.writeProperty(key, contact[key]);
    }
    this.data += "<EOR>\n\n";
  }

  writeProperty(key, value) {
    let outKey = key;
    if (key === "_id") outKey = "app_cloudshack_id";
    else if (key === "_rev") outKey = "app_cloudshack_rev";
    else if (key === "start") {
      const date = new Date(value);
      this.writeField("qso_date", dateformat(date, "UTC:yyyymmdd"));
      this.writeField("time_on", dateformat(date, "UTC:HHMMss"));
      return;
    } else if (key === "end") {
      const date = new Date(value);
      this.writeField("qso_date_off", dateformat(date, "UTC:yyyymmdd"));
      this.writeField("time_off", dateformat(date, "UTC:HHMMss"));
      return;
    }

    if (!(outKey in fields)) {
      console.log("adif: unknown adif field", outKey);
      return;
    }

    const field = fields[outKey];
    const encodedValue = field.encode(value);

    this.writeField(outKey, encodedValue);
  }

  writeField(key, value) {
    this.data += "<" + key.toUpperCase() + ":" + value.length + ">";
    this.data += value;
  }
}

module.exports = AdiWriter;
module.exports.AdiWriter = AdiWriter;
