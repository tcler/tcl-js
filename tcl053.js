/* =================================================== -*- C++ -*-
 * tcl.js "A Tcl implementation in Javascript"
 *
 * Released under the same terms as Tcl itself.
 * (BSD license found at <http://www.tcl.tk/software/tcltk/license.html>)
 *
 * Based on Picol by Salvatore Sanfilippo (<http://antirez.com/page/picol>)
 * (c) Stéphane Arnold 2007
 * Richard Suchenwirth 2007, 2013: cleanup, additions
 * vim: syntax=javascript autoindent softtabwidth=4
 */
// 'use strict'; // breaks some tests, like expr 0376, for loop
var _step = 0; // set to 1 for debugging
if(process.env["DEBUG"] == 1) _step = 1;
var fs    = require('fs');
var puts  = console.log; // saves a lot of typing... ;^)

function TclInterp () {
    this.patchlevel = "0.5.3";
    this.callframe  = [{}];
    this.level      = 0;
    this.levelcall  = [];
    this.commands   = {};
    this.procs      = [];
    this.script     = "";
    this.getsing    = 0;
    this.OK  = 0;
    this.RET = 1;
    this.BRK = 2;
    this.CNT = 3;
    this.getVar = function(name) {
        var nm  = name.toString();
	// no arrays supported yet, but a read-only exception for ::env()
        if (nm.match("^::env[(]")) nm = nm.substr(2);
        if (nm.match("^env[(]")) {
            var key = nm.substr(4,nm.length-5);
            var val = process.env[key];
        } else if (nm.match("^::")) {
            var val = this.callframe[0][nm.substr(2)]; // global
        } else {
            var val = this.callframe[this.level][name];
        }
        if (val == null) throw 'can\'t read "'+name+'": no such variable';
        return val;
    }
    this.setVar = function(name, val) {
      var nm  = name.toString();
      if (val != null && val.toString().match(/\\/))
	val = eval("'"+val.toString()+"'");
      if (nm.match("^::")) {
	this.callframe[0][nm.substr(2)] = val;
      } else {this.callframe[this.level][name] = val;}
      return val;
    }
    this.setVar("argc",  process.argv.length-2);
    this.setVar("argv0", process.argv[1]);
    this.setVar("argv",  process.argv.slice(2));
    this.setVar("errorInfo", "");

    this.incrLevel = function() {
      this.callframe[++this.level] = {};
      return this.level;
    }
    this.decrLevel = function() {
      this.callframe[this.level] = null;
      this.level--;
      if (this.level < 0) this.level = 0;
      this.result = null;
    }
    this.getCommand = function(name) {
        try {
            return this.commands[name];
        } catch (e) {throw "No such command '"+name+"'";}
    }
    this.registerCommand = function(name, func, privdata) {
        if (func == null) throw "No such function: "+name;
        this.commands[name] = new TclCommand(func, privdata);
     }
    this.registerSubCommand = function(name, subcmd, func, privdata) {
      if (func == null) throw "No such subcommand: "+ name +" " + subcmd;
      var path = name.split(" ");
      var ens;
      name = path.shift();
      var cmd = this.commands[name];
      if (cmd == null) {
	ens = {};
	this.commands[name] = new TclCommand(Tcl.EnsembleCommand, null, ens);
      }
      ens = this.commands[name].ensemble;
      if (ens == null) throw "Not an ensemble command: '"+name+"'";
      // walks deeply into the subcommands tree
      while (path.length > 0) {
	name = path.shift();
	cmd  = ens[name];
	if (cmd == null) {
	  cmd = new TclCommand(Tcl.EnsembleCommand, null, {});
	  ens[name] = cmd;
	  ens = cmd.ensemble;
	}
      }
      ens[subcmd] = new TclCommand(func, privdata);
    }
    this.eval = function (code) {
      try {
	return this.eval2(code);
      } catch (e) {
	var msg = code.substr(0,128);
	if(msg.length >= 125) msg += "...";
	var msg = e+'\n        while executing\n"'+msg+'"';
	for(var i = this.level; i > 0; i--)
	  msg += '\n        invoked from within\n"'+this.levelcall[i]+'"'
	this.setVar("::errorInfo", msg);
	if(_step) puts("e: "+e);
	throw e;
      }
    }
    this.eval2 = function(code) {
      this.code  = this.OK;
      var parser = new TclParser(code);
      var args   = [];
      var first  = true;
      var text, prevtype, result;
      result     = "";
      while (true) {
	prevtype = parser.type;
	try {
	  parser.getToken();
	} catch (e) {break;}
	if (parser.type == (parser.EOF)) break;
	text = parser.getText();
	if (parser.type == (parser.VAR)) {
	  text = this.getVar(text);
	} else if (parser.type == (parser.CMD)) {
	  try {
	    text = this.eval2(text);
	  } catch (e) {throw (e + "\nwhile parsing \"" + text + "\"");}
	} else if (parser.type == (parser.ESC)) {
	  // escape handling missing!
	  // puts("escape handler called");
	} else if (parser.type == (parser.SEP)) {
	  prevtype = parser.type;
	  continue;
	}
	text = this.objectify(text);
	if (parser.type ==parser.EOL || parser.type == parser.EOF) {
	  prevtype = parser.type;
	  if (args.length > 0) {
	    try {
	      result = this.call(args);
	    } catch(e) {
	      if(_step) puts("level: "+this.level+" args: "+args+" exception: "+e);
	      var cmd = this.getCommand(args[0]);
	      if (cmd == null) {
		if(args.length==1 && (args[0].toString().match(/ /))) {
		  throw e;
		}
		throw 'invalid command name "'+args[0]+'"';
	      }
	      if (cmd.ensemble != null) {
		throw 'wrong # args: should be "'+args[0]
		  +' subcommand ?argument ...?"';
	      }
	      throw e;
	    }
	    if (this.code != this.OK) return this.objectify(result);
	  }
	  args = [];
	  continue;
	}
	if (prevtype == parser.SEP || prevtype == parser.EOL) {
	  args.push(text);
	} else {
	  args[args.length-1] = args[args.length-1].toString() + text.toString();
	}
      }
      if (args.length > 0) result = this.call(args);
      return this.objectify(result);
    }
    //---------------------------------- Commands in alphabetical order
    /*this.registerCommand("after", function (interp, args) {
        this.arity(args, 3);
	var code = args[2].toString();
	setTimeout(args[1], function(code) {interp.eval(code)});
	});*/
    this.registerCommand("append", function (interp, args) {
        this.arity(args, 2, Infinity);
        var vname = args[1].toString();
	try {var str = interp.getVar(vname);} catch(e) {var str = "";}
	for (var i = 2; i < args.length; i++) str += args[i].toString();
        interp.setVar(vname, str);
        return str;
      });
    this.registerCommand("break", function (interp, args) {
        interp.code = interp.BRK;
        return;
      });
    this.registerCommand("catch", function (interp, args) {
	this.arity(args, 2, 3);
	var code = args[1].toString();
	var res;
	var rc   = 0;
	try {res = interp.eval(code);} catch(e) {res = e; rc = 1;}
	if(args.length == 3) interp.setVar(args[2], res);
	return rc;
      });
    this.registerCommand("cd", function (interp, args) {
	this.arity(args, 1, 2);
	var dir = process.env.HOME;
	if (args.length == 2) dir = args[1].toString();
	process.chdir(dir);
	return;
      });
    this.registerCommand("continue", function (interp, args) {
        interp.code = interp.CNT;
        return;
      });
    this.registerSubCommand("clock", "format", function (interp, args) {
        var now = new Date();
        now.setTime(args[1]*1000);
        var ts = now.toString().split(" ");
	var tz = ts[6].toString().replace("(","").replace(")","");
	return ts[0]+" "+ts[1]+" "+ts[2]+" "+ts[4]+" "+tz+" "+ts[3];
      });
    this.registerSubCommand("clock", "milliseconds", function (interp, args) {
	var t = new Date();
	return t.valueOf();
      });
    this.registerSubCommand("clock", "scan", function (interp, args) {
        return Date.parse(args[1]);
      });
    this.registerSubCommand("clock", "seconds", function (interp, args) {
	return Math.floor((new Date()).valueOf()/1000);
      });
    this.registerCommand("concat", function (interp, args) {
        this.arity(args, 1, Infinity);
	var res = [];
	for(var i = 1; i < args.length; i++) {
	  res = res.concat(args[i].toList());
	}
	return res;
      });
    this.registerSubCommand("dict", "create", function (interp, args) {
	if(args.length % 2 == 0) 
	  throw 'wrong # args: should be "dict create ?key value ...?"';
	return new TclObject(args.slice(1));
      });
    this.registerSubCommand("dict", "exists", function (interp, args) {
	if(args.length < 2) 
	  throw 'wrong # args: should be "dict exists dictionary ?key ...?"';
	var dict = args[1].toList();
	var key  = args[2].toString();
	for (var i=0;i < dict.length;i+=2) {
	  if(dict[i].toString() == key) return 1;
	}
	return 0;
      });
    this.registerSubCommand("dict", "get", function (interp, args) {
	if(args.length < 2) 
	  throw 'wrong # args: should be "dict get dictionary ?key ...?"';
	var dict = args[1].toList();
	var key  = args[2].toString();
	for (var i=0;i < dict.length;i+=2) {
	  if(dict[i].toString() == key) return dict[i+1];
	}
	throw 'key "'+key+'" not known in dictionary';
      });
    this.registerSubCommand("dict", "keys", function (interp, args) {
	if(args.length < 2 || args.length > 3) 
	  throw 'wrong # args: should be "dict keys dictionary ?globPattern?"';
	var dict    = args[1].toList();
	var pattern = ".*";
	if(args.length == 3) 
	  pattern = "^"+args[2].toString().replace(/\*/g,".*");
	var res  = [];
	for (var i = 0; i < dict.length; i+=2) {
	  if(dict[i].toString().match(pattern)) res.push(dict[i]);
	}
	return res;
      });
    this.registerSubCommand("dict", "set", function (interp, args) {
	this.arity(args, 4);
	var name  = args[1];
	var key   = args[2].toString();
	var val   = args[3].toString();
	var dict  = [];
	try {dict = interp.getVar(name);} catch(e) {dict = new TclObject([])};
	var found = false;
	var list  = dict.toList();
	for (var i = 0; i < list.length; i += 2) {
	  if(list[i].toString() == key) {
	    list[i+1] = val;
	    found = true;
	    break;
	  }
	}
	if (!found) {
	  list.push(interp.objectify(key)); 
	  list.push(interp.objectify(val));
	} 
	interp.setVar(name, dict);
	return dict;
      });
    this.registerSubCommand("dict", "unset", function (interp, args) {
	this.arity(args, 3);
	var name  = args[1];
	var key   = args[2].toString();
	var dict  = [];
	try {dict = interp.getVar(name);} catch(e) {dict = new TclObject([])};
	var found = false;
	var list  = dict.toList();
	for (var i = 0; i < list.length; i += 2) {
	  if(list[i].toString() == key) {
	    found = true;
	    break;
	  }
	}
	if(found) {
	  if(i == list.length) i -= 2;
	    list.splice(i, 2);
	    interp.setVar(name, dict);
	}
	return dict;
      });
    /*
      if(typeof(jQuery) != 'undefined') {
      this.registerCommand("dom", function (interp, args) {
      var selector = args[1].toString();
      var fn = args[2].toString();
      args = args.slice(3);
      for (var i in args) args[i] = args[i].toString();
      var q = $(selector);
      q[fn].apply(q,args);
      return "dom    " + selector;
      });
      }*/
    this.registerCommand("eval",function (interp, args) {
        this.arity(args, 2,Infinity);
        for (var i = 1; i < args.length; i++) args[i] = args[i].toString();
        if (args.length == 2) var code = args[1];
        else                  var code = args.slice(1).join(" ");
        return interp.eval(code);
      });
    /*
      this.registerCommand("exec",function (interp, args) {
      this.arity(args, 2, Infinity);
      var exec = require('child_process').exec,
      child;
      puts("exec "+args.slice(1).join(" "));
      child = exec(args.slice(1).join(" "),
      function (error, stdout, stderr) {
      var res = stdout.toString();
      //console.log('stdout: ' + stdout.toString());
      if (error !== null) {
      throw('exec error: ' + error);
      } 
      return res;
      });
      return this.execres;
      });
    */
    this.registerCommand("exit",function (interp, args) {
	this.arity(args, 1,2);
	var rc = 0;
	if (args.length == 2) rc = args[1];
	process.exit(rc);
      });
    var acos = Math.acos;
    var exp  = Math.exp;
    var sqrt = Math.sqrt; // "publish" other Math.* functions as needed

    this.registerCommand("expr", function (interp, args) {
	var expression = args.slice(1).join(" ");
	return interp.expr(interp, expression);
      });
    this.expr = function (interp, expression) { // also used in for, if, while
      var mx;
      try {
	mx = expression.match(/(\[.*\])/g);
	for (var i in mx)
	  puts("have to deal with "+mx[i].toString());
      } catch(e) {puts(i+". exception: "+e);}
      mx = expression.match(/(\$[A-Za-z0-9_:]+)/g);
      for (var i in mx) {
	var val = interp.getVar(mx[i].slice(1)).toString();
	if(isNaN(val) || !isFinite(val)) val = '"'+val+'"';
	eval("var "+mx[i]+' = '+val);
      }
      var res = eval(expression);
      if(res == false) res = 0; else if(res == true) res = 1;
      return res;
    };
    this.registerSubCommand("file", "atime", function (interp, args) {
        this.arity(args, 2);
	var stat = fs.statSync(args[1].toString());
	return stat.atime.getTime()/1000;
      })
    this.registerSubCommand("file", "dirname", function (interp, args) {
        this.arity(args, 2);
	return interp.dirname(args[1].toString());
     });
    this.dirname = function(p) { // also used in [glob]
      var path = require("path");
      return path.dirname(p.toString());
    };
    this.registerSubCommand("file", "exists", function (interp, args) {
        this.arity(args, 2);
	var file = args[1].toString();
	try {var fd = fs.openSync(file,"r");} catch(e) {return 0;}
	fs.closeSync(fd);
	return 1;
     });
    this.registerSubCommand("file", "extension", function (interp, args) {
        this.arity(args, 2);
	var fn  = args[1].toString();
	var res = fn.split(".").pop();
	res = (res == fn)? "" : "."+res;
	return res;
     });
    this.registerSubCommand("file", "join", function (interp, args) {
        this.arity(args, 2, Infinity);
	args.shift();
	var res = "", sep = "";
	for (var arg in args) {
	  var part = args[arg].toString();
	  if(part.match("^[/]")) 
	    res = part; else res = res+sep+part;
	  sep = "/";
	}
	return res;
      });
    this.registerSubCommand("file", "mtime", function (interp, args) {
        this.arity(args, 2);
	var stat = fs.statSync(args[1].toString());
	return stat.mtime.getTime()/1000;
      });
    this.registerSubCommand("file", "size", function (interp, args) {
        this.arity(args, 2);
	var stat = fs.statSync(args[1].toString());
	return stat.size;
      });
    this.registerSubCommand("file", "split", function (interp, args) {
        this.arity(args, 2);
	var path = args[1].toString().split("/");
	if(path[0] == "") path[0] = "/";
	return path;
      });
    this.registerSubCommand("file", "tail", function (interp, args) {
        this.arity(args, 2);
	return args[1].toString().split("/").pop();
      });
    this.registerCommand("for", function (interp, args) {
        this.arity(args, 5);
        interp.eval(args[1].toString());
        if(interp.code != interp.OK) return;
        var cond = args[2].toString();
        var step = args[3].toString();
        var body = args[4].toString();
        interp.inLoop = true;
        interp.code = interp.OK;
        while (true) {
            test = interp.objectify(interp.expr(interp, cond));
            if (!test.toBoolean()) break;
            interp.eval(body);
            var ic = interp.code; // tested after step command
            interp.eval(step);
            if(ic == interp.BRK) break;
            if(ic == interp.CNT) continue;
        }
        interp.inLoop = false;
        if(interp.code == interp.BRK || interp.code == interp.CNT)
            interp.code = interp.OK;
        return "";
    });
    this.registerCommand("foreach", function (interp, args) {
        this.arity(args, 4);
        var list = args[2].toList();
        var body = args[3].toString();
        var res    = "";
        interp.inLoop = true;
        interp.code = interp.OK;
        for(var i in list) {
	  //puts("now at "+list[i]+" level: "+interp.level);
	  interp.setVar(args[1],interp.objectify(list[i]));
	  interp.eval(body);
	  if(interp.code == interp.BRK) break;
	  if(interp.code == interp.CNT) continue;
        }
        interp.inLoop = false;
        if(interp.code == interp.BRK || interp.code == interp.CNT)
            interp.code=interp.OK;
        return "";
    });
    this.registerCommand("format", function (interp, args) {
        this.arity(args, 3);
	var fmt = args[1];
	var val = args[2];
	if(fmt=="%x") {
	  var x = new Number(val);
	  return x.toString(16);
	} else if(fmt=="%X") {
	  var x = new Number(val);
	  return x.toString(16).toUpperCase();
	}
	else throw "unknown format";	
      });
   this.registerCommand("gets0", function (interp, args) {
	this.arity(args, 2, 3);
	interp.getsing = 1;
	//interp.buf = "";
	//while(interp.buf == "") {
	//interp.timeout = setTimeout(function(){}, 10000);
	//  if(interp.getsing==0) break;
	//}
	return; // result will be in interp.buf when done
     });
/*   this.gets = function(char) {
     try {
       if(char.match(/foo[\r\n]/)) {
	 this.getsing = 0;
	 puts("received: "+this.buf);
       } else {
	 puts("<"+char+">"+this.getsing);
	 this.buf += char;
       }
     } catch(e) {puts(e)};
   }*/
   this.registerCommand("glob", function (interp, args) {
	this.arity(args, 2, Infinity);
	args.shift();
	var res    = [];
	var prefix = "";
	var dir    = ".";
	for (var arg in args) {
	  var path    = args[arg].toString();
	  if(path.match("[/]")) {
	     var dir    = interp.dirname(path);
	     var prefix = dir+"/";
	  }
	  var pattern = path.split("/").pop().replace(/[*]/g,".*");
	  var files   = fs.readdirSync(dir);
	  for (var i in files) {
	    if(files[i].match("^[.]")) continue;
	    if(files[i] == pattern) {res.push(files[i]);}
	    if(files[i].match("^"+pattern+"$")) {
	      var file = (dir == ".")? files[i] : dir+"/"+files[i];
	      res.push(file.replace(/\/\//,"/"));
	    }
	  }
	}
	return res;
      });
    this.registerCommand("if", function (interp, args) {
        this.arity(args, 3, Infinity);
        var cond = args[1].toString();
        var test = interp.objectify(interp.expr(interp, cond));
        if (test.toBoolean()) return interp.eval(args[2].toString());
        if (args.length == 3) return;
        for (var i = 3; i < args.length; ) {
            switch (args[i].toString()) {
            case "else":
                this.arity(args, i + 2);
                return interp.eval(args[i+1].toString());
            case "elseif":
                this.arity(args, i + 3);
                test = interp.objectify(interp.expr(interp, args[i+1].toString()));
                if (test.toBoolean())
                    return interp.eval(args[i+2].toString());
                i += 3;
                break;
            default:
                throw "Expected 'else' or 'elseif', got "+ args[i];
            }
        }
    });
    this.registerCommand("incr", function (interp, args) {
        this.arity(args, 2, 3);
        var name = args[1];
        if (args.length == 2) var incr = 1;
        else var incr = interp.objectify(args[2]).toInteger();
        incr += interp.getVar(name).toInteger();
        return interp.setVar(name, new TclObject(incr, "INTEGER"));
    });
    this.registerSubCommand("info", "args", function (interp, args) {
        this.arity(args, 2);
        var name = args[1].toString();
        if (!interp.procs[name]) throw '"'+name+'" isn\'t a procedure';
        return interp.getCommand(name).privdata[0];
    });
    this.registerSubCommand("info", "body", function (interp, args) {
        this.arity(args, 2);
        var name = args[1].toString();
        if (!interp.procs[name]) throw '"'+name+'" isn\'t a procedure';
        return interp.getCommand(name).privdata[1];
    });
    this.registerSubCommand("info", "commands", function (interp, args) {
        return interp.mkList(interp.commands);
    });
    this.registerSubCommand("info", "exists", function (interp, args) {
        this.arity(args, 2);
	var name = args[1];
	try {interp.getVar(name); return 1;} catch(e) {return 0;}
    });
    this.registerSubCommand("info", "globals", function (interp, args) {
        return interp.mkList(interp.callframe[0]);
    });
    /* not in "real" Tcl
    this.registerSubCommand("info", "isensemble", function (interp, args) {
        this.arity(args, 2);
        var name = args[1].toString();
	var cmd  = interp.getCommand(name);
        return (cmd != null && cmd.ensemble != null)? "1" : "0";
	}); */
    this.registerSubCommand("info", "level", function (interp, args) {
	if(args.length == 1)
	  return interp.level;
	var delta = args[1];
	return interp.levelcall[interp.level - delta];
    });
    this.registerSubCommand("info", "nameofexecutable", function (interp, args) {
            return process.execPath;
    });
    this.registerSubCommand("info", "patchlevel", function (interp, args) {
	return interp.patchlevel;
    });
    this.registerSubCommand("info", "procs", function (interp, args) {
        return interp.mkList(interp.procs);
    });
    this.registerSubCommand("info", "script", function (interp, args) {
        return interp.script;
    });
    this.registerSubCommand("info", "vars", function (interp, args) {
	var res = [];
	for(var i in interp.callframe[interp.level]) {
	  try {
	    if(interp.getVar(i) != null) {res.push(i);}
	  } catch(e) {};
	}
	return res;
    });
    this.registerCommand("join", function (interp, args) {
	this.arity(args, 2, 3);
	var lst = args[1].toList();
	var sep = " ";
	if(args.length == 3) sep = args[2].toString();
	var res = [];
	var re  = /^{.*}$/;
	for (var i in lst) {
	  var word = lst[i].toString();
	  if (re.test(word)) word = word.substring(1,word.length-1);
	  res.push(word);
	}
	return res.join(sep);
      });
    this.registerCommand("jseval", function (interp, args) {
        return eval(args[1].toString());
      });
    this.registerCommand("lappend", function (interp, args) {
        this.arity(args, 2, Infinity);
        var vname = args[1].toString();
	try {
	  var list = interp.getVar(vname);
	} catch(e) {var list = new TclObject([]);}
        list.toList();
        for (var i = 2; i < args.length; i++) {
	  if(args[i] == "") args[i] = "{}";
	  list.content.push(interp.objectify(args[i]));
        }
        interp.setVar(vname, list);
        return list;
      });
    this.registerCommand("lindex", function (interp, args) {
        this.arity(args, 3, Infinity);
        var list = interp.objectify(args[1]);
        for (var i = 2; i < args.length; i++) {
	  try {
	    var index = list.listIndex(args[i]);
	  } catch (e) {
	    if (e == "Index out of bounds") return "";
	    throw e;
	  }
	  list = list.content[index];
        }
        return interp.objectify(list);
      });
    this.registerCommand("list", function (interp, args) {
	args.shift();
	return new TclObject(args);
      });
    this.registerCommand("llength", function (interp, args) {
        this.arity(args, 2);
        return args[1].toList().length;
      });
    this.registerCommand("lrange", function (interp, args) {
        this.arity(args, 4);
        var list  = interp.objectify(args[1]);
        var start = list.listIndex(args[2]);
        var end   = list.listIndex(args[3])+1;
        try {
	  return list.content.slice(start, end);
        } catch (e) {return [];}
      });
    this.registerCommand("lreverse", function (interp, args) {
        this.arity(args, 2);
        return args[1].toList().reverse();
      });
    this.registerCommand("lset", function (interp, args) {
        this.arity(args, 4, Infinity);
        var list = interp.getVar(args[1].toString());
        var elt = list;
        for (var i = 2; i < args.length-2; i++) {
	  elt.toList();
	  elt = interp.objectify(elt.content[elt.listIndex(args[i])]);
        }
        elt.toList();
        i = args.length - 2;
        elt.content[elt.listIndex(args[i])] = interp.objectify(args[i+1]);
        return list;
      });
    this.registerCommand("lsearch", function (interp, args) {
        this.arity(args, 3);
        var lst = args[1].toList();
        for(var i in lst) if(lst[i] == args[2].toString()) return i;
        return -1;
      });
    this.registerCommand("lsort", function (interp, args) {
        this.arity(args, 2);
        return args[1].toList().sort();
      });
    this.registerCommand("pid", function (interp, args) {
	return process.pid;
      });
    this.registerCommand("puts", function (interp, args) {
	this.arity(args, 2);
	puts(args[1].toString());
      });
    this.registerCommand("pwd", function (interp, args) {
	return process.cwd();
      });
    this.registerCommand("proc", function (interp, args) {
        this.arity(args, 4);
        var name = args[1].toString();
        var argl = interp.parseList(args[2]);
        var body = args[3].toString();
        var priv = [argl, body];
        interp.commands[name] = new TclCommand(Tcl.Proc, priv);
        interp.procs[name]    = true;
      });
    this.registerCommand("regexp", function (interp, args) {
        this.arity(args, 3);
        var re    = new RegExp(args[1].toString());
        var str = args[2].toString();
        return (str.search(re) > -1? "1":"0");
      });
    this.registerCommand("regsub", function (interp, args) {
        this.arity(args, 4);
        var re    = new RegExp(args[1].toString());
        var str = args[2].toString();
        var trg = args[3].toString();
        return (str.replace(re,trg));
      });
    this.registerCommand("rename", function (interp, args) {
        this.arity(args, 3);
	var name    = args[1];
	var newname = args[2];
	interp.commands[newname] = interp.commands[name];
        if (interp.procs[name]) {
	  interp.procs[name] = null;
	  interp.procs[newname] = true;
        }
        interp.commands[name] = null;
      });
    this.registerCommand("return", function (interp, args) {
        this.arity(args, 1, 2);
        var r = args[1];
        interp.code = interp.RET;
        return r;
    });
    this.registerCommand("set", function (interp, args) {
        this.arity(args, 2, 3);
        var name = args[1];
	var val  = eval(args[2]);
        if (args.length == 3) interp.setVar(name, val);
        return interp.getVar(name);
    });
    this.registerCommand("source", function (interp, args) {
        this.arity(args, 2);
        interp.script = args[1].toString();
        try {
	  var data = fs.readFileSync(interp.script,{encoding: 'utf8'}).toString();
        } catch(e) {
	  puts("e: "+e);
	  throw 'couldn\' read file "'+interp.script
	    +'": no such file or directory';}
	var res       = interp.eval(data);
	interp.script = "";
	return res;
      });
    this.registerCommand("split", function (interp, args) {
        this.arity(args, 2, 3);
        var str = args[1].toString();
        var sep = (args.length == 3)? args[2].toString() : " ";
	var res = [], element;
        var tmp = str.split(sep);
	for(var i in tmp) {
	  element = tmp[i];
	  if(element == "") element = "{}";
	  res.push(element);
	}
	return res.join(" ");
      });
    this.registerSubCommand("string", "compare", function (interp, args) {
        this.arity(args, 3);
	var a = args[1].toString();
	var b = args[2].toString();
	return a > b? "1": a < b? "-1": "0";
      });
    this.registerSubCommand("string", "equal", function (interp, args) {
        this.arity(args, 3);
        return (args[1].toString() == args[2].toString())? "1": "0";
      });
    this.registerSubCommand("string", "index", function (interp, args) {
        this.arity(args, 3);
        var s = args[1].toString();
        try {
	  return s.charAt(args[1].stringIndex(args[2]));
        } catch (e) {return "";}
      });
    this.registerSubCommand("string", "length", function (interp, args) {
        this.arity(args, 2);
        return args[1].toString().length;
      });
    this.registerSubCommand("string", "range", function (interp, args) {
        this.arity(args, 4);
        var s = args[1];
        try {
            var b = s.stringIndex(args[2]);
            var e = s.stringIndex(args[3]);
            if (b > e) return "";
            return s.toString().substring(b, e + 1);
        } catch (e) {return "";}
    });
    this.registerSubCommand("string", "tolower", function (interp, args) {
        this.arity(args, 2);
        return args[1].toString().toLowerCase();
    });
    this.registerSubCommand("string", "toupper", function (interp, args) {
        this.arity(args, 2);
        return args[1].toString().toUpperCase();
    });
    this.registerSubCommand("string", "trim", function (interp, args) {
        this.arity(args, 2);
        return args[1].toString().trim();
    });
    function sec_msec () {
        var t = new Date();
        return t.getSeconds()*1000 + t.getMilliseconds();
    }
    this.registerCommand("time", function (interp, args) {
        this.arity(args, 2, 3);
        var body = args[1].toString();
        var n    = (args.length == 3)? args[2] : 1;
        var t0   = sec_msec();
        for(var i = 0; i < n; i++) interp.eval(body);
        return (sec_msec()-t0)*1000/n + " microseconds per iteration";
    });
    this.registerCommand("unset", function (interp, args) {
        this.arity(args, 2, Infinity);
        for (var i = 1; i < args.length; i++)
	  interp.setVar(args[i], null);
    });
    this.registerCommand("uplevel",function (interp, args) {
        this.arity(args, 3, Infinity);
	var mycallframe = interp.callframe[interp.level];
        var delta = args[1].toInteger();
        interp.level -= delta;
	if(interp.level < 0) {
	  interp.level += delta;
	  throw 'bad level "'+delta+'"';
	}
        for (var i = 2; i < args.length; i++) args[i] = args[i].toString();
        if (args.length == 3) {
	  var code = args[2];
        } else var code = args.slice(2).join(" ");
        var res = interp.eval(code);
        interp.level += delta;
	interp.callframe[interp.level] = mycallframe;
        return res;
      });
    this.registerCommand("while", function (interp, args) {
        this.arity(args, 3);
        var cond = args[1].toString();
        var body = args[2].toString();
        var res  = "";
        interp.inLoop = true;
        interp.code = interp.OK;
        while (true) {
	  test = interp.objectify(interp.expr(interp, cond));
	  if (!test.toBoolean()) break;
	  res = interp.eval(body);
	  if(interp.code == interp.CNT) continue;
	  if(interp.code != interp.OK)    break;
        }
        interp.inLoop = false;
        if(interp.code == interp.BRK || interp.code == interp.CNT)
	  interp.code=interp.OK;
        return interp.objectify(res);
      });
    // native cmdname {function(interp, args) {...}}
    this.registerCommand("native", function (interp, args) {
        this.arity(args, 3);
        var cmd = args[1].toList();
	puts("before eval "+args[2]);
        var func = eval(args[2].toString());
	puts("ok so far");
        //alert("in: "+args[2].toString()+", func: "+ func);
        if (cmd.length == 1) {
	  interp.registerCommand(cmd[0].toString(), func);
	  return;
        }
        base = cmd[0].toString();
        cmd.shift();
        interp.registerSubCommand(base, cmd.join(" "), eval(args[2].toString()));
        return;
      });
    this.mkList = function(x) {
      var list = [];
      for (var name in x) {list.push(name);}
      return list;
    }
    this.objectify = function (text) {
      if (text == null) text = "";
      else if (text instanceof TclObject) return text;
      return new TclObject(text);
    }
    this.parseString = function (text) {
      text = text.toString();
      switch (text.charAt(0)+text.substr(text.length-1)) {
      case "{}":
      case '""':
	text = text.substr(1,text.length-2);
      break;
      }
      return this.objectify(text);
    }
    this.parseList = function (text) {
      text = text.toString();
      switch (text.charAt(0)+text.substr(text.length-1)) {
      case "{}":
      case '""':
	text = [text];
      break;
      }
      return this.objectify(text);
    }
    this.call = function(args) {
      if(_step) puts("this.call "+args);
      var func = this.getCommand(args[0]);
      if(func == null) throw 'invalid command name "'+args[0]+'"';
      var res  = func.call(this,args);
      switch (this.code) {
      case this.OK: case this.RET: return res;
      case this.BRK:
	if (!this.inLoop) throw 'invoked "break" outside of a loop';
	break;
      case this.CNT:
	if (!this.inLoop) throw 'invoked "continue" outside of a loop';
	break;
      default: throw "Unknown return code " + this.code;
      }
      return res;
    }
}

var Tcl = {};
Tcl.isReal     = new RegExp("^[+\\-]?[0-9]+\\.[0-9]*([eE][+\\-]?[0-9]+)?$");
Tcl.isDecimal  = new RegExp("^[+\\-]?[1-9][0-9]*$");
Tcl.isHex      = new RegExp("^0x[0-9a-fA-F]+$");
Tcl.isOctal    = new RegExp("^[+\\-]?0[0-7]*$");
Tcl.isHexSeq   = new RegExp("[0-9a-fA-F]*");
Tcl.isOctalSeq = new RegExp("[0-7]*");
Tcl.isList     = new RegExp("[\\{\\} ]");
Tcl.isNested   = new RegExp("^\\{.*\\}$");
Tcl.getVar     = new RegExp("^[:a-zA-Z0-9_]+", "g");

Tcl.Proc = function (interp, args) {
   var priv = this.privdata;
   interp.incrLevel();
   var arglist = priv[0].toList();
   var body    = priv[1];
   var call    = []; 
   for(var i in args) {
     var elt = args[i].toString();
     if(elt.match(/ /)) elt = "{"+elt+"}";
     call.push(elt);
   }
   interp.levelcall[interp.level] = call.join(" ");
   args.shift();
   for (var i = 0; i < arglist.length; i++) {
       var name = arglist[i].toString();
       if (i >= args.length) {
           if (name == "args") {
               interp.setVar("args", Tcl.empty);
               break;
           }
       }
       if (Tcl.isList.test(name)) {
           name = interp.parseString(name).toList();
           if (name[0] == "args") throw "'args' defaults to the empty string";
           if (i >= args.length)
               interp.setVar(name.shift(), interp.parseString(name.join(" ")));
           else interp.setVar(name[0], interp.objectify(args[i]));
       } else if (name == "args") {
           interp.setVar("args", new TclObject(args.slice(i, args.length)));
           break;
       }
       interp.setVar(name, interp.objectify(args[i]));
   }
   if (name == "args" && i+1 < arglist.length)
     throw "'args' should be the last argument";
   try {
       var res = interp.eval(body);
       interp.code = interp.OK;
       interp.decrLevel();
       return res;
   } catch (e) {
       interp.decrLevel();
       throw "Tcl.Proc exception "+e;
   }
}
/** Manage subcommands */
Tcl.EnsembleCommand = function (interp, args) {
  var sub  = args[1].toString();
  var main = args.shift().toString()+" "+sub;
  args[0]  = main;
  var ens  = this.ensemble;
  if (ens == null) {
    throw "Not an ensemble command: "+main;
  } else if (ens[sub] == null) {
    var matches = 0, lastmatch = "";
    for (var i in ens) { // maybe unambiguous prefix?
      if (i.match("^"+sub) != null) {
	matches  += 1;
	lastmatch = i;
      } 
    }
    if(matches == 1) {
      sub = lastmatch;
    } else {
      var r = [];
      for (i in ens) r.push(i);
      r[r.length-1] = "or "+r[r.length-1];
      throw 'unknown or ambiguous subcommand "'+sub+'": must be '+r.join(", ");
    }
  }
  return ens[sub].call(interp, args);
}
function TclObject(text) {
    this.TEXT    = 0;
    this.LIST    = 1;
    this.INTEGER = 2;
    this.REAL    = 3;
    this.BOOL    = 4;
    switch (arguments[0]) {
    case "LIST":
    case "INTEGER":
    case "REAL":
    case "BOOL":
        this.type = this[arguments[0]];
        break;
    default:
        this.type = this.TEXT;
        if (text instanceof Array) this.type = this.LIST;
        else text = text.toString();
        break;
    }
    this.content = text;
    this.stringIndex = function (i) {
        this.toString();
        return this.index(i, this.content.length);
    }
    this.listIndex = function (i) {
        this.toList();
        return this.index(i, this.content.length);
    }
    this.index = function (i, len) {
        var index = i.toString();
        if (index.substring(0,4) == "end-")
            index = len - parseInt(index.substring(4)) - 1;
        else if (index == "end") index = len-1;
        else index = parseInt(index);
        if (isNaN(index)) throw "Bad index "+i;
        if (index < 0 || index >= len) throw "Index out of bounds";
        return index;
    }
    this.isInteger = function () {return (this.type == this.INTEGER);}
    this.isReal    = function () {return (this.type == this.REAL);}
    this.getString = function (list, nested) {
        var res = [];
        for (var i in list) {
            res[i] = list[i].toString();
            if (Tcl.isList.test(res[i]) && !Tcl.isNested.test(res[i]))
                res[i] = "{" + res[i] + "}";
        }
        if (res.length == 1) return res[0];
        return res.join(" ");
    }
    this.toString = function () {
      if (this.type != this.TEXT) {
	if (this.type == this.LIST)
	  this.content = this.getString(this.content);
	else this.content = this.content.toString();
	this.type = this.TEXT;
      }
      return this.content;
    }
    this.toList = function () {
      if (this.type != this.LIST) {
	if (this.type != this.TEXT)
	  this.content[0] = this.content;
	else {
	  var text = this.content;
	  if (text.charAt(0) == "{" && text.charAt(text.length-1) == "}")
	    text = text.substring(1, text.length-1);
	  if (text == "")
	    return [];
	  
	  var parser = new TclParser(text.toString());
	  this.content = [];
	  for(;;) {
	    parser.parseList();
	    this.content.push(new TclObject(parser.getText()));
	    if (parser.type == parser.EOL || parser.type == parser.ESC)
	      break;
	  }
	}	
	this.type = this.LIST;
      }
      return this.content;
    }
    this.toInteger = function () {
      if (this.type == this.INTEGER) return this.content;
      this.toString();
      if (this.content.match(Tcl.isHex))
	this.content = parseInt(this.content.substring(2), 16);
      else if (this.content.match(Tcl.isOctal))
	this.content = parseInt(this.content, 8);
      else if (this.content.match(Tcl.isDecimal))
	this.content = parseInt(this.content);
      else throw "Not an integer: '"+this.content+"'";
      if (isNaN(this.content)) throw "Not an integer: '"+this.content+"'";
      this.type = this.INTEGER;
      return this.content;
    }
    this.getFloat = function (text) {
      if (!text.toString().match(Tcl.isReal))
        throw "Not a real: '"+text+"'";
      return parseFloat(text);
    }
    this.toReal = function () {
      if (this.type == this.REAL)
        return this.content;
      this.toString();
      // parseFloat doesn't control all the string, so need to check it
      this.content = this.getFloat(this.content);
      if (isNaN(this.content)) throw "Not a real: '"+this.content+"'";
      this.type = this.REAL;
      return this.content;
    }
    this.getNumber = function () {
      try {
	return this.toInteger();
      } catch (e) {return this.toReal();}
    }
    this.toBoolean = function () {
      if (this.type == this.BOOL) return this.content;
      try {
	this.content = (this.toInteger() != 0);
      } catch (e) {
	var t = this.content;
	if (t instanceof Boolean) return t;
	switch (t.toString().toLowerCase()) {
	case "yes": case "true": case "on":
	  this.content = true;
	  break;
	case "false": case "off": case "no":
	  this.content = false;
	  break;
	default:
	  throw "Boolean expected, got: '"+this.content+"'";
	}
      }
      this.type = this.BOOL;
      return this.content;
    }
}
function TclCommand(func, privdata) {
  if (func == null) throw "No such function";
  this.func     = func;
  this.privdata = privdata;
  this.ensemble = arguments[2];
  
  this.call = function(interp, args) {
    var res = (this.func)(interp, args);
    res = interp.objectify(res);
    return res;
  }
  this.arity = function (args, min, max) {
    if(max == undefined) max = min;
    if (args.length < min || args.length > max) {
      throw min + ".."+max + " words expected, got "+args.length;
    }
  } 
}
function TclParser(text) {
  this.OK  = 0;
  this.SEP = 0;
  this.STR = 1;
  this.EOL = 2;
  this.EOF = 3;
  this.ESC = 4;
  this.CMD = 5;
  this.VAR = 6;
  this.text        = text;
  this.start       = 0;
  this.end         = 0;
  this.insidequote = false;
  this.index       = 0;
  this.len         = text.length;
  this.type        = this.EOL;
  this.cur         = this.text.charAt(0);
  this.getText     = function () {
    return this.text.substring(this.start,this.end+1);
  }
  this.parseString = function () {
    var newword = (this.type == this.SEP ||
		   this.type == this.EOL || this.type == this.STR);
    if (newword && this.cur == "{") return this.parseBrace();
    else if (newword && this.cur == '"') {
      this.insidequote = true;
      this.feedchar();
    }
    this.start = this.index;
    while (true) {
      if (this.len == 0) {
	this.end  = this.index-1;
	this.type = this.ESC;
	return this.OK;
      }
      /*if (this.cur == "\\") { // works not :(
	if (this.len >= 2) this.feedSequence();
	}
	else*/ if ("$[ \t\n\r;".indexOf(this.cur)>=0) {
	if ("$[".indexOf(this.cur)>=0 || !this.insidequote) {
	  this.end  = this.index-1;
	  this.type = this.ESC;
	  return this.OK;
	}
      }
      else if (this.cur == '"' && this.insidequote) {
	this.end  = this.index-1;
	this.type = this.ESC;
	this.feedchar();
	this.insidequote = false;
	return this.OK;
      }
      this.feedchar();
    }
    return this.OK;
  }
  this.parseList = function () {
    var level  = 0;
    this.start = this.index;
    while (true) {
      if (this.len == 0) {
	this.end  = this.index;
	this.type = this.EOL;
	return;
      }
      switch (this.cur) {
	/*case "\\":
	if (this.len >= 2) this.feedSequence();
	break;*/
      case " ": case "\t": case "\n": case "\r":
	if (level > 0) break;
	this.end  = this.index - 1;
	this.type = this.SEP;
	this.feedchar();
	return;
      case '{': level++; break;
      case '}': level--; break;
      }
      this.feedchar();
    }
    if (level != 0) throw "Not a list";
    this.end = this.index;
    return;
  }
  this.parseSep = function () {
    this.start = this.index;
    while (" \t\r\n".indexOf(this.cur)>=0) this.feedchar();
    this.end    = this.index - 1;
    this.type = this.SEP;
    return this.OK;
  }
  this.parseEol = function () {
    this.start = this.index;
    while(" \t\n\r;".indexOf(this.cur)>=0) this.feedchar();
    this.end    = this.index - 1;
    this.type = this.EOL;
    return this.OK;
  }
  this.parseCommand = function () {
    var level = 1;
    var blevel = 0;
    this.feedcharstart();
    while (true) {
      if (this.len == 0) break;
      if (this.cur == "[" && blevel == 0)
	level++;
      else if (this.cur == "]" && blevel == 0) {
	level--;
	if (level == 0) break;
	//} else if (this.cur == "\\") {
	//this.feedSequence();
      } else if (this.cur == "{") {
	blevel++;
      } else if (this.cur == "}") {
	if (blevel != 0) blevel--;
      }
      this.feedchar();
    }
    this.end    = this.index-1;
    this.type = this.CMD;
    if (this.cur == "]") this.feedchar();
    return this.OK;
  }
  this.parseVar = function () {
    this.feedcharstart();
    this.end = this.index
    + this.text.substring(this.index).match(Tcl.getVar).toString().length-1;
    if (this.end == this.index-1) {
      this.end = --this.index;
      this.type = this.STR;
    } else this.type = this.VAR;
    this.setPos(this.end+1);
    return this.OK;
  }
  this.parseBrace = function () {
    var level = 1;
    this.feedcharstart();
    while (true) {
      /*if (this.len > 1 && this.cur == "\\") {
	this.feedSequence();
	} else*/
      if (this.len == 0 || this.cur == "}") {
	level--;
	if (level == 0 || this.len == 0) {
	  this.end = this.index-1;
	  if (this.len > 0) this.feedchar();
	  this.type = this.STR;
	  return this.OK;
	}
      } else if (this.cur == "{") level++;
      this.feedchar();
    }
    return this.OK; // unreached
  }
  this.parseComment = function () {
    while (this.cur != "\n" && this.cur != "\r") this.feedchar();
  }
  this.getToken = function () {
    while (true) {
      if (this.len == 0) {
	if (this.type == this.EOL) this.type = this.EOF;
	if (this.type != this.EOF) this.type = this.EOL;
	return this.OK;
      }
      switch (this.cur) {
      case ' ':
      case '\t':
      if (this.insidequote) return this.parseString();
      return this.parseSep();
      case '\n':
      case '\r':
      case ';':
      if (this.insidequote) return this.parseString();
      return this.parseEol();
      case '[': return this.parseCommand();
      case '$': return this.parseVar();
      }
      if (this.cur == "#" && this.type == this.EOL) {
	this.parseComment();
	continue;
      }
      return this.parseString();
    }
    //return this.OK; // unreached
  }
  this.feedSequence = function () {
    //return;
    if (this.cur != "\\") throw "Invalid escape sequence";
    var cur = this.steal(1);
    puts("enter feedSequence, text: "+this.text+" cur: "+cur);
    var specials = {};
    specials.a = "\a";
    specials.b = "\b";
    specials.f = "\f";
    specials.n = "\n";
    specials.r = "\r";
    specials.t = "\t";
    specials.v = "\v";
    switch (cur) {
    case 'u':
      var hex = this.steal(4);
      if (hex != Tcl.isHexSeq.exec(hex))
	throw "Invalid unicode escape sequence: "+hex;
      cur = String.fromCharCode(parseInt(hex,16));
      break;
    case 'x':
      /*
      var hex = cur; //this.steal(2);
      puts("enter case x, hex: '"+hex+"' cur: '"+cur+'"');
      if (hex != Tcl.isHexSeq.exec(hex))
	throw "Invalid unicode escape sequence: "+hex;
      cur = String.fromCharCode(parseInt(hex,16));
      //puts("hex: "+hex.toString()+" cur: "+cur);
      */
      break;
    case "a": case "b": case "f": case "n":
    case "r": case "t": case "v":
      cur = specials[cur];
      break;
    default:
      if ("0123456789".indexOf(cur) >= 0) {
	cur = cur + this.steal(2);
	if (cur != Tcl.isOctalSeq.exec(cur))
	  throw "Invalid octal escape sequence: "+cur;
	cur = String.fromCharCode(parseInt(cur, 8));
      }
      break;
    }
    this.text[index] = cur;
    this.feedchar();
  }
  this.steal = function (n) {
    var tail = this.text.substring(this.index+1);
    var word = tail.substr(0, n);
    this.text = this.text.substring(0, this.index-1) + tail.substring(n);
    //puts("tail: "+tail+" word: "+word);
    return word;
  }
  this.feedcharstart = function () {
    this.feedchar();
    this.start = this.index;
  }
  this.setPos = function (index) {
    var d      = index-this.index;
    this.index = index;
    this.len  -= d;
    this.cur   = this.text.charAt(this.index);
  }
  this.feedchar = function () {
    this.index++;
    this.len--;
    if (this.len < 0)
      throw "End of file reached";
    this.cur = this.text.charAt(this.index);
  }
}
//------------------------------------- main Read-Eval-Print loop
var itp = new TclInterp();
var res;
process.argv.slice(2).forEach(function(cmd,index,array) {
       itp.eval(cmd);
     });
var readline = require('readline');
var rl       = readline.createInterface(process.stdin, process.stdout);
rl.setPrompt('% ');
rl.prompt();
itp.gets = function(line) {
  if (itp.getsing == 0) {
    try {
      res = itp.eval(line.trim());
    } catch(e) {res = e;}
    if (itp.getsing == 0) {
      if(res != null && res.toString().length) 
	puts(res.toString());
      rl.prompt();
    }
  } else {itp.buf = line; itp.getsing = 0; rl.prompt();}
};
rl.on('line', itp.gets).on('close',function() {process.exit(0);});
