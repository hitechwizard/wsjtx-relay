const datetime = require("./datetime");
const fields = require("./fields");

const PARSE_NIL = 0;
const PARSE_NAME = 1;
const PARSE_LENGTH = 2;
const PARSE_TYPE = 3;
const PARSE_VALUE = 4;

class AdiReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
  }

  readAll() {
    const contacts = [];

    while (true) {
      const contact = this.readNext();
      if (!contact) break;
      contacts.push(contact);
    }

    return contacts;
  }

  readNext() {
    let contact = {};

    while (true) {
      const field = this.readField();
      if (!field) return null;

      const name = field[0];
      let value = field[1];

      if (name in fields) {
        if (!value) continue;

        const fieldDef = fields[name];
        value = fieldDef.decode(value);

        if (value) {
          contact[name] = value;
        }
      } else if (name === "eor") {
        break;
      } else if (name === "eoh") {
        contact = {};
        continue;
      } else {
        console.log("adif: unknown adif field", name);
        continue;
      }
    }

    datetime.fixQsoDateTime(contact);

    return contact;
  }

  readField() {
    let state = PARSE_NIL;
    let fieldName = "";
    let fieldLength = "";
    let fieldType = "";
    let fieldValue = "";

    for (; this.pos < this.data.length; this.pos++) {
      const c = this.data[this.pos];

      switch (state) {
        case PARSE_NIL:
          if (c === "<") state = PARSE_NAME;
          break;

        case PARSE_NAME:
          if (c === ":") {
            fieldName = fieldName.toLowerCase();
            state = PARSE_LENGTH;
          } else if (c === ">") {
            fieldName = fieldName.toLowerCase();
            return [fieldName, null];
          } else {
            fieldName += c;
          }
          break;

        case PARSE_LENGTH:
          if (c === ":") {
            fieldLength = parseInt(fieldLength, 10);
            state = PARSE_TYPE;
          } else if (c === ">") {
            fieldLength = parseInt(fieldLength, 10);
            state = PARSE_VALUE;
          } else {
            fieldLength += c;
          }
          break;

        case PARSE_TYPE:
          if (c === ">") state = PARSE_VALUE;
          else fieldType += c;
          break;

        case PARSE_VALUE:
          if (fieldLength > 0) {
            fieldLength--;
            fieldValue += c;
          } else {
            return [fieldName, fieldValue];
          }
          break;

        default:
          return null;
      }
    }

    return null;
  }
}

module.exports = AdiReader;
module.exports.AdiReader = AdiReader;
