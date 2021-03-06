/**
 * Asynchronous, browser-compatible JSON-RPC for Ethereum
 * 
 * @author Jack Peterson (jack@tinybike.net)
 * @license MIT
 */

var rpc = {
    protocol: "http",
    host: "127.0.0.1",
    port: 8545,
    async: true
};

var NODE_JS = typeof(module) != 'undefined';
if (NODE_JS) {
    var http = require('http');
    var httpsync = require('http-sync');
    var keccak_256 = require('js-sha3').keccak_256;
    var BigNumber = require('bignumber.js');
    var XMLHttpRequest = require('xhr2');
}

var pdata, id = 1;
var rpc_url = rpc.protocol + "://" + rpc.host + ":" + rpc.port.toString();
var default_gas = "0x2dc6c0";

function log(msg) {
    var output = "[ethrpc.js] ";
    if (msg) {
        if (msg.constructor == Object || msg.constructor == Array) {
            output += JSON.stringify(msg, null, 2);
        } else {
            output += msg.toString();
        }
        console.log(output);
    }
}

function parse_array(string, stride, init, bignum) {
    stride = stride || 64;
    var elements = (string.length - 2) / stride;
    var array = Array(elements);
    var position = init || 2;
    for (var i = 0; i < elements; ++i) {
        array[i] = "0x" + string.slice(position, position + stride);
        if (bignum) {
            array[i] = new BigNumber(array[i]);
        }
        position += stride;
    }
    return array;
}

function encode_int(value) {
    var cs = [];
    while (value > 0) {
        cs.push(String.fromCharCode(value % 256));
        value = Math.floor(value / 256);
    }
    return (cs.reverse()).join('');
}

function encode_hex(str) {
    var byte, hex = '';
    for (var i = 0, len = str.length; i < len; ++i) {
        byte = str.charCodeAt(i).toString(16);
        if (byte.length === 1) byte = "0" + byte;
        hex += byte;
    }
    return hex;
}

function zeropad(r, ishex) {
    var output = r;
    if (!ishex) output = encode_hex(output);
    while (output.length < 64) {
        output = '0' + output;
    }
    return output;
}

function encode_abi(arg, base, sub, arrlist) {
    if (arrlist && arrlist.slice(-2) === "[]") {
        var res, o = '';
        for (var j = 0, l = arg.length; j < l; ++j) {
            res = encode_abi(arg[j], base, sub, arrlist.slice(0,-1));
            o += res.normal_args;
        }
        return {
            len_args: zeropad(encode_int(arg.length)),
            normal_args: '',
            var_args: o
        };
    } else {
        var len_args = normal_args = var_args = '';
        if (base === "string") {
            len_args = zeropad(encode_int(arg.length));
            var_args = encode_hex(arg);
        }
        if (base === "int") {
            if (arg.constructor === Number) {
                normal_args = zeropad(encode_int(arg % Math.pow(2, sub)));
            } else if (arg.constructor === String) {
                if (arg.slice(0,2) === "0x") {
                    normal_args = zeropad(arg.slice(2), true);
                } else {
                    normal_args = zeropad(encode_int(parseInt(arg) % Math.pow(2, sub)));
                }
            }
        }
        return {
            len_args: len_args,
            normal_args: normal_args,
            var_args: var_args
        }
    }
}

function get_prefix(funcname, signature) {
    signature = signature || "";
    var summary = funcname + "(";
    for (var i = 0, len = signature.length; i < len; ++i) {
        switch (signature[i]) {
            case 's':
                summary += "string"; // change to bytes?
                break;
            case 'i':
                summary += "int256";
                break;
            case 'a':
                summary += "int256[]";
                break;
            default:
                summary += "weird";
        }
        if (i != len - 1) summary += ",";
    }
    var prefix = keccak_256(summary + ")").slice(0, 8);
    while (prefix.slice(0, 1) === '0') {
        prefix = prefix.slice(1);
    }
    return "0x" + prefix;
}

function clone(obj) {
    if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}

function parse(response, callback) {
    response = JSON.parse(response);
    if (response.error) {
        console.error(
            "[" + response.error.code + "]",
            response.error.message
        );
    } else {
        if (rpc.async && response.result && callback) {
            callback(response);
        } else {
            if (response.result && callback) {
                return callback(response);
            } else if (response.result) {
                return response.result;
            } else {
                return response;
            }
        }
    }
}

function postdata(command, params, prefix) {
    pdata = {
        id: id++,
        jsonrpc: "2.0"
    };
    if (prefix === "null") {
        pdata.method = command.toString();
    } else {
        pdata.method = (prefix || "eth_") + command.toString();
    }
    if (params) {
        if (params.constructor === Array) {
            pdata.params = params;
        } else {
            pdata.params = [params];
        }
    } else {
        pdata.params = [];
    }
    return JSON.stringify(pdata);
}

// post json-rpc command to ethereum client
function json_rpc(command, async, callback) {
    var req = null;
    if (NODE_JS) {
        if (async || rpc.async) {
            req = new XMLHttpRequest();
            req.onreadystatechange = function () {
                if (req.readyState == 4) {
                    parse(req.responseText, callback);
                }
            };
            req.open("POST", rpc_url, true);
            req.setRequestHeader("Content-type", "application/json");
            req.send(command);
        } else {
            req = httpsync.request({
                protocol: rpc.protocol,
                host: rpc.host,
                path: '/',
                port: rpc.port,
                method: 'POST'
            });
            req.write(command);
            return parse((req.end()).body.toString(), callback);
        }
    } else {
        if (window.XMLHttpRequest) {
            req = new XMLHttpRequest();
        } else {
            req = new ActiveXObject("Microsoft.XMLHTTP");
        }
        if (async || rpc.async) {
            req.onreadystatechange = function () {
                if (req.readyState == 4) {
                    parse(req.responseText, callback);
                }
            };
            req.open("POST", rpc_url, true);
            req.setRequestHeader("Content-type", "application/json");
            req.send(command);
        } else {            
            req.open("POST", rpc_url, false);
            req.setRequestHeader("Content-type", "application/json");
            req.send(command);
            return parse(req.responseText, callback);
        }
    }
}

function format_result(returns, result) {
    try {
        if (returns === "array") {
            result = parse_array(result);
        } else if (returns === "int") {
            result = parseInt(result);
        } else if (returns === "bignumber") {
            result = new BigNumber(result);
        }
    } catch (exc) {
        log(exc);
    }
    return result;
}

var EthRPC = {
    async: rpc.async,
    rpc: function (command, params, f) {
        return json_rpc(postdata(command, params, "null"), rpc.async, f);
    },
    eth: function (command, params, f) {
        return json_rpc(postdata(command, params), rpc.async, f);
    },
    net: function (command, params, f) {
        return json_rpc(postdata(command, params, "net_"), rpc.async, f);
    },
    web3: function (command, params, f) {
        return json_rpc(postdata(command, params, "web3_"), rpc.async, f);
    },
    db: function (command, params, f) {
        return json_rpc(postdata(command, params, "db_"), rpc.async, f);
    },
    shh: function (command, params, f) {
        return json_rpc(postdata(command, params, "shh_"), rpc.async, f);
    },
    hash: function (data, small, f) {
        if (data) {
            if (data.constructor === Array || data.constructor === Object) {
                data = JSON.stringify(data);
            }
            return json_rpc(postdata("sha3", data.toString(), "web3_"), rpc.async, function (data) {
                var hash = (small) ? data.result.slice(0, 10) : data.result;
                if (f) {
                    return f(hash);
                } else {
                    return hash;
                }
            });
        }
    },
    gasPrice: function (f) {
        return json_rpc(postdata("gasPrice"), rpc.async, function (data) {
            var gasPrice = parseInt(data.result);
            if (f) {
                return f(gasPrice);
            } else {
                return gasPrice;
            }
        });
    },
    blockNumber: function (f) {
        return json_rpc(postdata("blockNumber"), rpc.async, function (data) {
            var blocknum = parseInt(data.result);
            if (f) {
                return f(blocknum);
            } else {
                return blocknum;
            }
        });
    },
    balance: function (address, block, f) {
        return json_rpc(postdata("getBalance", [address, block || "latest"]), rpc.async, f || function (data) {
            var ether = (new BigNumber(data.result)).dividedBy(new BigNumber(10).toPower(18));
            if (rpc.async) {
                log(ether);
            } else {
                return ether.toNumber();
            }
        });
    },
    txCount: function (address, f) {
        return json_rpc(postdata("getTransactionCount", address), rpc.async, f);
    },
    call: function (tx, f) {
        tx.to = tx.to || "";
        tx.gas = (tx.gas) ? "0x" + tx.gas.toString(16) : default_gas;
        return json_rpc(postdata("call", tx), rpc.async, f);
    },
    sendTx: function (tx, f) {
        tx.to = tx.to || "";
        tx.gas = (tx.gas) ? "0x" + tx.gas.toString(16) : default_gas;
        return json_rpc(postdata("sendTransaction", tx), rpc.async, f);
    },
    pay: function (from, to, value, f) {
        return this.sendTx({ from: from || this.coinbase(), to: to, value: value }, f);
    },
    getTx: function (hash, f) {
        return json_rpc(postdata("getTransactionByHash", hash), rpc.async, f);
    },
    peerCount: function (f) {
        if (rpc.async) {
            return json_rpc(postdata("peerCount", [], "net_"), rpc.async, f);
        } else {
            return parseInt(json_rpc(postdata("peerCount", [], "net_"), rpc.async, f));
        }
    },
    coinbase: function (f) {
        return json_rpc(postdata("coinbase"), rpc.async, f);
    },
    // publish a new contract to the blockchain (from the coinbase account)
    publish: function (compiled, f) {
        return this.sendTx({ from: this.coinbase(), data: compiled }, f);
    },
    // hex-encode a function's ABI data and return it
    abi_data: function (tx, f) {
        tx.signature = tx.signature || "";
        var data_abi = get_prefix(tx.function, tx.signature);
        var types = [];
        for (var i = 0, len = tx.signature.length; i < len; ++i) {
            if (tx.signature[i] == 's') {
                types.push("string");
            } else if (tx.signature[i] == 'a') {
                types.push("int256[]");
            } else {
                types.push("int256");
            }
        }
        if (tx.params) {
            if (tx.params.constructor === String) {
                if (tx.params.slice(0,1) === "[" && tx.params.slice(-1) === "]") {
                    tx.params = JSON.parse(tx.params);
                }
                if (tx.params.constructor === String) {
                    tx.params = [tx.params];
                }
            } else if (tx.params.constructor === Number) {
                tx.params = [tx.params];
            }
        } else {
            tx.params = [];
        }
        var len_args = '';
        var normal_args = '';
        var var_args = '';
        var base, sub, arrlist;
        if (types.length == tx.params.length) {
            for (i = 0, len = types.length; i < len; ++i) {
                if (types[i] === "string") {
                    base = "string";
                    sub = '';
                } else if (types[i] === "int256[]") {
                    base = "int";
                    sub = 256;
                    arrlist = "[]";
                } else {
                    base = "int";
                    sub = 256;
                }
                res = encode_abi(tx.params[i], base, sub, arrlist);
                len_args += res.len_args;
                normal_args += res.normal_args;
                var_args += res.var_args;
            }
            data_abi += len_args + normal_args + var_args;
        } else {
            return console.error("wrong number of parameters");
        }
        return data_abi;
    },
    /**
     * Invoke a function from a contract on the blockchain.
     *
     * Input tx format:
     * {
     *    from: <sender's address> (hexstring; optional, coinbase default)
     *    to: <contract address> (hexstring)
     *    function: <function name> (string)
     *    signature: <function signature, e.g. "iia"> (string)
     *    params: <parameters passed to the function> (optional)
     *    returns: <"array", "int", "BigNumber", or "string" (default)>
     *    send: <true to sendTransaction, false to call (default)>
     * }
     */
    invoke: function (tx, f) {
        var packaged, invocation, result;
        if (tx) {
            var tx = clone(tx);
            data_abi = this.abi_data(tx);
            if (data_abi) {
                packaged = {
                    from: tx.from || this.coinbase(),
                    to: tx.to,
                    data: data_abi
                };
                invocation = (tx.send) ? this.sendTx : this.call;
                if (rpc.async) {
                    result = invocation(packaged, f);
                } else {
                    result = invocation(packaged, f);
                    if (tx.returns) {
                        result = format_result(tx.returns.toLowerCase(), result);
                    }
                    return result;
                }
            }
        }
    },
    // read the code in a contract on the blockchain
    read: function (address, block, f) {
        if (address) {
            return json_rpc(postdata("getCode", [address, block || "latest"]), rpc.async, f);
        }
    },
    id: function () { return id; },
    data: function () { return pdata; },
    // aliases
    sha3: function (data, f) { return this.hash(data, f); },
    getBalance: function (address, block, f) { return this.balance(address, block, f); },
    getTransactionCount: function (address, f) { return this.txCount(address, f); },
    sendTransaction: function (tx, f) { return this.sendTx(tx, f); },
    getTransactionByHash: function (hash, f) { return this.getTx(hash, f); },
    getCode: function (address, block, f) { return this.read(address, block, f); },
    run: function (tx, f) { this.invoke(tx, f); },
    execute: function (tx, f) { this.invoke(tx, f); }
};

if (NODE_JS) module.exports = EthRPC;
