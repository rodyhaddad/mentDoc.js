/*
    Copyright (c) 2013 rodyhaddad

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is furnished
    to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.
    
*/
var mentDoc = (function(){
	var mentDoc,
	    registeredCommands = {};
	
	function Commands(el, parent) {
    	this.el = el;
    	this.parent = parent || null;
    	this.attrs = {};
    	this.children = [];
    	this.data = parent ? makeInherit(parent.data) : {};
    	
    	this.el.style.textDecoration = "none";
    	
    	this.refreshAttrs();
    	this.updateChildren();
	}
	
	Commands.isCommandsEl = function(el) {
    	return (el.nodeType === 1 && el.nodeName === "U");
	};
	
	Commands.prototype = {
    	constructor: Commands,
    	
    	refreshAttrs: function() {
        	var domAttrs = this.el.attributes,
    	        attrs = {};
        	
        	forEach(domAttrs, function(attr) {
            	if (attr.specified) {
                	var name = attr.name,
                	    value = this.el.getAttribute(name, 3);
                	    
                	attrs[mentDoc.normalizeAttr(name)] = value;
            	}
        	}, this);
        	
        	this.attrs = attrs;
    	},
    	
    	updateChildren: function() {
        	this.children = [];
        	this._loopThroughEl(this.el.childNodes);
    	},
    	_loopThroughEl: function(childNodes) {
        	forEach(childNodes, function(el) {
            	if(Commands.isCommandsEl(el)) {
                	var childCommands = new Commands(el, this);
                	this.children.push(childCommands);
                	childCommands.updateChildren();
            	} else if (el.nodeType === 1) {
                	this._loopThroughEl(el.childNodes);
            	}
        	}, this);
    	},
    	
    	execute: function() {
        	forEach(this.attrs, function(value, name) {
            	if (registeredCommands[name]) {
                	registeredCommands[name](this.el, value, this);
            	}
        	}, this);
        	this.executeChildren();
    	},
    	executeChildren: function() {
        	forEach(this.children, function(child) {
            	child.execute();
        	});
    	},
    	
    	getElContent: function() {
        	return this.el.innerHTML;
    	}
	}
	
	return mentDoc = {
	    Commands: Commands,
	    
    	compile: function(html) {
        	var elRoot;
        	
        	elRoot = document.createElement("u");
        	elRoot.innerHTML = html;
        	
        	return new Commands(elRoot);
    	},
    	
    	registeredCommands: registeredCommands,
    	addCommand: function(name, info) {
        	registeredCommands[name] = info;
    	},
    	
    	//taken from angularjs
    	normalizeAttr: (function(){
    		var PREFIX_REGEXP = /^(x[\:\-_]|data[\:\-_])/i;
    		var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
            var MOZ_HACK_REGEXP = /^moz([A-Z])/;
            
            function camelCase(name) {                	
                return name.
                    replace(SPECIAL_CHARS_REGEXP, function(_, separator, letter, offset) {
                        return offset ? letter.toUpperCase() : letter;
                    }).replace(MOZ_HACK_REGEXP, 'Moz$1');
            }
            
    		return function(name) {
            	return camelCase(name.replace(PREFIX_REGEXP, ''));
        	}
    		
    	}()),
    	
    	forEach: forEach,
    	isArray: isArray,
    	isObject: isObject,
    	isFn: isFn,
    	makeInherit: makeInherit
	};
	
	function forEach(obj, iterator, context) {
        var key;
        if(obj && iterator) {
            context = context || obj;
            if(isFn(obj)) {
                for(key in obj) {
                    if(key != "prototype" && key != "length" && key != "name" && obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            } else if (obj.forEach && obj.forEach !== forEach) {
                obj.forEach(iterator, context);
            } else if (isArray(obj) || obj.hasOwnProperty("length")) {
                for(key = 0; key < obj.length; key++)
                    iterator.call(context, obj[key], key);
            } else {
                for(key in obj) {
                    if(obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            }
        }
        return obj;
    };
    
    function isArray(obj) {
        return Object.prototype.toString.call(obj) === "[object Array]";
    };

    function isObject(obj) {
        return typeof obj === "object" && obj !== null;
    };
    
    function isFn(fn) {
        return typeof fn === "function";
    };
    
    function makeInherit(obj) {
        if (Object.create) {
            return Object.create(obj);
        } else {
            var o = function() {};
            o.prototype = obj;
            return new o;
        }
    }
	
}());

mentDoc.addCommand("appendTo", function(el, value, commands) {
    $(value, commands.data.inPage).append(commands.getElContent());
});

mentDoc.addCommand("empty", function(el, value, commands) {
    $(value, commands.data.inPage).empty();
});

mentDoc.addCommand("remove", function(el, value, commands) {
    $(value, commands.data.inPage).remove();
});

mentDoc.addCommand("inPage", function(el, value, commands) {
    commands.data.inPage = value;
});



mentDoc.addCommand("markdown", function(el, value, commands) {
    var converter = Markdown.getSanitizingConverter();
    
    Markdown.Extra.init(converter, {extensions: "all", highlighter: "prettify"});
    
    var content = commands.getElContent();
    var matches = content.match(/(\t| )+\^\^\^/g);

    if (matches) {
        var len = matches[0].length - 3;
        lines = content.split(/\n/g);
        for(var i = 0; i < lines.length; i++) {
            lines[i] = lines[i].substring(len);
            if (lines[i] === "^^^") {
                lines[i] = "";
            }
        }
        content = lines.join("\n")
    }
    
    commands.data.compiledMarkdown =  converter.makeHtml(content);
    commands.getElContent = function() {
        return commands.data.compiledMarkdown;
    }
});