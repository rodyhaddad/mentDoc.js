var mentDoc = (function(){
	
	return {
	    _getCommandsEl: function (containerEl) {
    	    return Array.prototype.slice.call(
    	       containerEl.getElementsByTagName("u")
    	    )
	    },
    	compile: function (html) {
        	var commandsEl, containerEl;
        	
        	
        	containerEl = document.createElement("div");    
        	containerEl.innerHTML = html;
        	
        	commandsEl = this._getCommandsEl(containerEl);
        	
        	forEach(commandsEl, function(el) {
            	var attrs = el.attributes;
            	
            	forEach(attrs, function(attr) {
                	if (attr.specified) {
                    	var name = attr.name,
                    	    value = el.getAttribute(name, 3);
                	}
            	});
        	});
        	
    	},
    	
    	
    	
    	
    	forEach: forEach,
    	isArray: isArray,
    	isObject: isObject,
    	isFn: isFn
	};
	
	function forEach(obj, iterator, context) {
        var key;
        if(obj) {
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