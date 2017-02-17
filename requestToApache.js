var http = require('http');

function requestToApache(requestUrl, clientData, responseCallback) {
  var options = {
    host: clientData.hostName,
    port: 80,
    path: requestUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': clientData.cookies
    }
  };

  var req = http.request(options, function(res) {
    var output = '';
    res.setEncoding('utf8');

    res.on('data', function(chunk) {
      output += chunk;
    });

    res.on('end', function() {
      var obj = JSON.parse(output);
      responseCallback(obj);
    });
  });

  req.on('error', function(err) {
    console.log("Connection to apache error", err);
  });

  req.end();
}

module.exports.default = requestToApache;
