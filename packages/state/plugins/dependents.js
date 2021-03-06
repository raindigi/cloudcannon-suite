var through = require("through2").obj;

module.exports = function (config, data) {
    const options = config || {};

    return through(function(file, encoding, callback) {
        if (file.isNull()) {
            return callback(null, file);
        }
        if (file.isStream()) {
            return callback(null, file);
        }
        file.sitePath = file.path.substring(file.base.length);
        file.sitePath = file.sitePath.replace(/\/index.html?/i, "/");
        
        var dependants = {
            "Required By": []
        };
        for (var key in data) {
            for (var list in data[key]) {
                if (data[key][list].includes(file.sitePath)) {
                    dependants["Required By"].push(key);
                    break;
                }
            }
        }
        this.push([file.sitePath, dependants]);
        callback();
    });
}