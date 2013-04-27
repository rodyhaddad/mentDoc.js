var mentDoc = (function(){
	var mentDoc;
	
	function Command(el, parent) {
    	this.el = el;
    	this.parent = parent || null;
    	this.attrs = {};
    	this.children = [];
    	
    	this.refreshAttrs();
    	this.updateChildren();
	}
	
	Command.isCommandEl = function(el) {
    	return (el.nodeType === 1 && el.nodeName === "U");
	};
	
	Command.prototype = {
    	constructor: Command,
    	
    	refreshAttrs: function() {
        	var domAttrs = this.el.attributes,
    	        attrs = {};
        	
        	forEach(domAttrs, function(attr) {
            	if (attr.specified) {
                	var name = attr.name,
                	    value = this.el.getAttribute(name, 3);
                	    
                	attrs[name] = value;
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
            	if(Command.isCommandEl(el)) {
                	var childCommand = new Command(el, this);
                	this.children.push(childCommand);
                	childCommand.updateChildren();
            	} else if (el.nodeType === 1) {
                	this._loopThroughEl(el.childNodes);
            	}
        	}, this);
    	},
    	
    	execute: function() {
        	forEach(this.children, function(child) {
            	child.execute();
        	});
    	}
	}
	
	return mentDoc = {
	    Command: Command,
	    
    	compile: function(html) {
        	var elRoot;
        	
        	elRoot = document.createElement("u");    
        	elRoot.innerHTML = html;
        	
        	return new Command(elRoot);
    	},
    	
    	
    	forEach: forEach,
    	isArray: isArray,
    	isObject: isObject,
    	isFn: isFn
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
	
}());