const fs = require("fs");
const key = fs.readFileSync("./admin-key.json");
const encoded = Buffer.from(key).toString("base64");
console.log(encoded);