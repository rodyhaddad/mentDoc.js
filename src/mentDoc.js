var mentDoc = (function(){
	var mentDoc,
	    registeredCommands = {};
	
	function Commands(el, parent) {
    	this.el = el;
    	this.parent = parent || null;
    	this.attrs = {};
    	this.children = [];
    	this.data = parent ? makeInherit(parent.data) : {};
    	
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
    $(value, commands.data.inPage).append($(el).contents());
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