window.calledMethods = {};  //XXX:  purely for testing/debugging purposes; can be checked to see if any unimplemented methods have been called

//browser-independent context implementation; intercepts drawing API calls and passes them to the backing canvas elements, translating as necessary
function BrowserIndependentContext(canvas) {
    //properties (initialize to default values according to HTML5 spec)
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.shadowColor = "#000000";
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this.lineWidth = 1;
    this.miterLimit = 10;
    
    this.font = "10px sans-serif";
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    
    this.globalAlpha = 1.0;
    this.globalCompositeOperation = "source-over";
    
    this.width = canvas.width;
    this.height = canvas.height;
    //this.data = undefined;
    
    this.canvas = canvas;
    
    this.configurationProperties = [
        "fillStyle",
        "strokeStyle",
        "shadowColor",
        "shadowBlur",
        "shadowOffsetX",
        "shadowOffsetY",
        "lineCap",
        "lineJoin",
        "lineWidth",
        "miterLimit",
        "font",
        "textAlign",
        "textBaseline",
        "globalAlpha",
        "globalCompositeOperation",
    ];
    
    this.contexts = [];
    for (var index = 0; index < this.canvas.canvasElems.length; index++) {
    	var canvas = this.canvas.canvasElems[index];
    	var context = canvas.getContext("2d");
    	canvas.context = context;
    	
    	this.contexts.push(context);
    }
}

//browser detection, because the maximum supported canvas size is different in most of them, and it's better to use a single native canvas element wherever possible
//FIXME:  as an optimization, make it so that whenever a single canvas element is used all API calls simple pass-through to the native canvas instance
BrowserIndependentContext.browser = {};
var ua = window.navigator.userAgent;
var old_ie = ua.indexOf('MSIE ');
var new_ie = ua.indexOf('Trident/');
var ieMobile = ( !! window.ActiveXObject && +( /IEMobile\/(\d+\.?(\d+)?)/.exec( navigator.userAgent )[1] ) ) || NaN;
if ((old_ie > -1) || (new_ie > -1)) {
	BrowserIndependentContext.browser.ms_ie = true;
}
if(window.navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
	BrowserIndependentContext.browser.firefox = true;
}
if (window.navigator.userAgent.search("Safari") >= 0 && window.navigator.userAgent.search("Chrome") < 0) {
	BrowserIndependentContext.browser.safari = true;
}

//XXX:  note that we truncate maximum sizes to the neareast even thousand, though the actual limits are in multiples of 1024
BrowserIndependentContext.maximumSupportedCanvasSize = 4000;			//safe default for most things (but NOT mobile browsers)
if (BrowserIndependentContext.browser.ms_ie && ! ieMobile) {
	BrowserIndependentContext.maximumSupportedCanvasSize = 8000;		//desktop version of IE breaks after 8K pixels in either dimension
}
if (BrowserIndependentContext.browser.firefox || BrowserIndependentContext.browser.safari) {
	BrowserIndependentContext.maximumSupportedCanvasSize = 32000;		//desktop version of Firefox and Safari are good for up to 32K pixels
}
if (! ieMobile && ! BrowserIndependentContext.browser.ms_ie && ! BrowserIndependentContext.browser.safari && ! BrowserIndependentContext.browser.firefox && window.navigator.userAgent.search("Chrome") >= 0) {
	BrowserIndependentContext.maximumSupportedCanvasSize = 32000;		//desktop version of Chrome is good for up to 32K pixels
}


//public API wrapper
BrowserIndependentContext.prototype.fillRect = function(startX, startY, width, height) {
	//determine what calls we need to pass to the backing canvas elements
	var calls = [];
	var endY = startY + height;
	while (startY < endY && height > 0) {
		var canvas = this.canvas.getCanvasAtHeight(startY);
		if (! canvas) {
			//XXX:  should never happen, unless fillRect is called with invalid dimensions
			console.log("ERROR:  No canvas found for y=" + startY, this.canvas.canvasElems);
		}
		
		var drawPosition = startY - canvas.y;
		var drawHeight = canvas.height - drawPosition;
		if (drawHeight > height) {
			drawHeight = height;
		}
		if (drawHeight <= 0) {
			console.log("WARN:  fillRect computed a drawHeight of 0!");
			break;
		}
		
		calls.push({canvas: canvas, x: startX, y: drawPosition, w: width, h: drawHeight});
		
		height -= drawHeight;
		startY += drawHeight;
	}
	
    //make the calls
	for (var index = 0; index < calls.length; index++) {
		var call = calls[index];
		var canvas = call.canvas;
		this.applySettings(canvas.context);
		canvas.context.fillRect(call.x, call.y, call.w, call.h);
	}
};
BrowserIndependentContext.prototype.fillText = function(text, startX, startY, maxWidth) {
	if (! startX || ! startY) {
		//XXX:  unsure why these happen (observed when running with html2canvas)
		console.log("WARN:  fillText() called with invalid parameters; text=" + text + ", x=" + startX + ", y=" + startY);
		return;
	}
	
	//XXX:  note that this only draws a single line of text at a time, so the only thing we need to worry about is if the text falls right on the top/bottom edge of a canvas element
	//			the most reliable way to accommodate this is to draw the text into an intermediate canvas, take an image of the text, and then draw the text as an image using our own 
	//      API call so that it can properly straddle two canvas elements if needed
	//
	//XXX:  a possible optimization would be to use the dimensions determined for the text being rendered to see if an overlap occurs, and just draw the text normally on the appropriate 
	//	    canvas when there is no overlap detected
	var endOfText = this.heightOfFont(this.font);
	var canvas1 = this.canvas.getCanvasAtHeight(startY); 				//first canvas that will receive text
	var canvas2 = this.canvas.getCanvasAtHeight(startY + endOfText);	//last canvas that will receive text
	if (canvas1 == canvas2) {
		//the text does not straddle more than one canvas; draw it as text
		this.applySettings(canvas1.context);
		if (maxWidth) {
			canvas1.context.fillText(text, startX, startY - canvas1.y, maxWidth);
		}
		else {
			canvas1.context.fillText(text, startX, startY - canvas1.y);
		}
	}
	else {
		//the text straddles two canvas elements; draw it as an image so that it can be split across them correctly
		var tempCanvas = document.createElement("canvas");
		tempCanvas.width = maxWidth ? maxWidth : this.width;
		tempCanvas.height = endOfText;    
		
		//determine the required width of the text
		var tempContext = tempCanvas.getContext("2d");
		this.applySettings(tempContext);
		var textWidth = tempContext.measureText(text).width;
	
		//resize and clear the temp canvas
		tempCanvas.width = textWidth;
		
		//redraw the text
		tempContext = tempCanvas.getContext("2d");
		this.applySettings(tempContext);
		tempContext.fillText(text, 0, endOfText - (endOfText * 0.15));  //FIXME:  some font styles are clipped when this happens
		
		//XXX:  better to draw the content directly using drawImage() than it is to get/put the raw image data
		this.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, startX, startY, tempCanvas.width, tempCanvas.height); 
	}
};

//XXX:  note that parameters are interpreted differently depending upon the number of arguments provided        
BrowserIndependentContext.prototype.putImageData = function(image, startX, startY, destX, destY, destWidth, destHeight) {
  //sanitize parameters
	destX = destX ? destX : 0;
	destY = destY ? destY : 0;
	destWidth = destWidth ? destWidth : image.width;
	destHeight = destHeight ? destHeight : image.height;
	
	//determine what calls we need to pass on
	var calls = [];
	var endY = startY + destHeight;
	while (startY < endY && destHeight > 0) {
		var canvas = this.canvas.getCanvasAtHeight(startY);
		var drawPosition = startY - canvas.y;
		var drawHeight = canvas.height - drawPosition;
		if (drawHeight > destHeight) {
			drawHeight = destHeight;
		}
		
		calls.push({canvas: canvas, x: startX, y: drawPosition, dx: destX, dy: destY, w: destWidth, h: drawHeight});
		
		destY += drawHeight;
		destHeight -= drawHeight;
		startY = canvas.y + canvas.height;
	}
	
    //make the calls
	for (var index = 0; index < calls.length; index++) {
		var call = calls[index];
		var canvas = call.canvas;
		this.applySettings(canvas.context);
		canvas.context.putImageData(call.x, call.y, call.dx, call.dy, call.w, call.h);
	}
};
BrowserIndependentContext.prototype.drawImage = function(imageElem, clipX, clipY, clipWidth, clipHeight, startX, startY, targetWidth, targetHeight) {
	//sanitize parameters
	if (arguments.length == 3) {
		startX = clipX;
		startY = clipY;
		
		clipX = 0;						//starting position to take from image
		clipY = 0;                      //starting position to take from image
		clipWidth = imageElem.width;    //width of data to take from image
		clipHeight = imageElem.height;  //height of data to take from image
		targetWidth = clipWidth;        //size of image to draw in the canvas
		targetHeight = clipHeight;      //size of image to draw in the canvas
	}
	else if (arguments.length == 5) {
		startX = clipX;
		startY = clipY;
		targetWidth = clipWidth;
		targetHeight = clipHeight;
		
		clipX = 0;
		clipY = 0;
		clipWidth = imageElem.width;
		clipHeight = imageElem.height;
	}
	else if (arguments.length != 9) {
		//invalid call, ignore it
		console.log("WARN:  Unsupported call to drawImage; this method supports 3, 5, and 9 argument invocations, but was invoked with " + arguments.length + " arguments");
		return;
	}
	
	//this API call is allowed to scale the image, so we need to know how it will be affected along the y-axis to allow it to properly cross canvas boundaries
	var scaleY = targetHeight / imageElem.height; 
	
	//determine what calls we need to pass on
	var calls = [];
	var endY = startY + targetHeight;
	while (startY < endY && targetHeight > 0) {
		var canvas = this.canvas.getCanvasAtHeight(startY);
		var drawPosition = startY - canvas.y;
		var drawHeight = canvas.height - drawPosition;
		if (drawHeight > targetHeight) {
			drawHeight = targetHeight;
		}
		
		calls.push({canvas: canvas, image: imageElem, cx: clipX, cy: clipY, cWidth: clipWidth, cHeight: clipHeight, x: startX, y: drawPosition, w: targetWidth, h: drawHeight});
		
		clipY += drawHeight / scaleY;
		clipHeight -= drawHeight / scaleY;
		startY = canvas.y + canvas.height;
	}
	
    //make the calls
	for (var index = 0; index < calls.length; index++) {
		var call = calls[index];
		var canvas = call.canvas;
		this.applySettings(canvas.context);
		canvas.context.drawImage(call.image, call.cx, call.cy, call.cWidth, call.cHeight, call.x, call.y, call.w, call.h); 
	}
};
BrowserIndependentContext.prototype.getImageData = function(startX, startY, width, height) {
	//here we assume that we'll never be asked for more image data than the browser can hold in a single canvas element (if we are we're pretty much screwed anyways)
	var imageCanvas = document.createElement("canvas");
	imageCanvas.width = width;
	imageCanvas.height = height;
	
	var imageY = 0;
	var endY = startY + height;
	var imageContext = imageCanvas.getContext("2d");
	
	//stitch together the images from the backing canvases into a single image
	while (startY < endY && height > 0) {
		var canvas = this.canvas.getCanvasAtHeight(startY);
		var exportPosition = startY - canvas.y;
		var exportHeight = canvas.height - exportPosition;
		if (exportHeight > height) {
			exportHeight = height;
		}
		
		imageContext.drawImage(canvas, startX, exportPosition, width, exportHeight, startX, imageY, width, exportHeight); 
		
		imageY += exportHeight;
		height -= exportHeight;
		startY = canvas.y + canvas.height;
	}
		
	return imageContext.getImageData(0, 0, width, imageCanvas.height);
};

BrowserIndependentContext.prototype.moveTo = function(startX, startY) {
	//moveTo is relatively easy by itself; we just need to find the relevant canvas and translate the y-coordinate appropriately for it
	var canvas = this.canvas.getCanvasAtHeight(startY);
	canvas.context.moveTo(startX, startY - canvas.y);
	canvas.currentPosition = {x: startX, y:startY - canvas.y};  //track this for later retrieval when evaluating the path
	this.drawingCanvas = canvas;
};

BrowserIndependentContext.prototype.lineTo = function(startX, startY) {
	//somewhat more complicated; we need to get the currently drawing canvas, draw on it until we either complete the line (easy) or hit the y-axis bounds (harder), and 
	//then continue traversing additional canvas elements until the line is complete, synthesizing any moveTo() calls as required and keeping track of the currently 
	//drawing canvas
	if (! this.drawingCanvas || ! this.drawingCanvas.currentPosition) {
		//FIXME:  this happens on occasion; possibly avoid clearing state when starting/finishing a path (drawing lines without explicitly starting a path is permitted by the canvas API)?
		console.log("ERROR:  Drawing was attempted without beginning a valid path!");
		return;
	}
	
	var canvas = this.drawingCanvas;
	var origin = canvas.currentPosition;
	var vertical = origin.x == startX;
	var slope = vertical ? 0 : (origin.y - startY) / (origin.x - startX); 
	
	this.applySettings(canvas);
	
	var minY = canvas.y;
	var maxY = canvas.y + canvas.height;
	if (minY <= startY && maxY >= startY) {
		//the line we want to draw does not leave the current canvas element (easy!)
		startY -= canvas.y;
		canvas.context.lineTo(startX, startY);
		canvas.currentPosition = {x: startX, y: startY};
	}
	else {
		//we leave the current canvas element; need to work out where the line intersects a y-boundary, draw the portion that we can on our current canvas, prepare the next canvas element, and then reissue the lineTo() call
		if (startY < minY) {
			//we go off the top; determine the relevant coordinate at the point of intersection
			var destY = 0;//canvas.y;
			var destX = vertical ? startX : this.xCoord(slope, origin, destY);
			
			//draw the line and update our current position
			canvas.context.lineTo(destX, destY);
			canvas.currentPosition = {x: destX, y: destY};
			
			//work out the previous canvas
			if (canvas.y - 1  >= 0) {
				//only set up the previous canvas if there actually is one
				var nextCanvas = this.canvas.getCanvasAtHeight(canvas.y - 1);
				nextCanvas.context.moveTo(destX, nextCanvas.y + nextCanvas.height);
				
				this.drawingCanvas = nextCanvas;
				
				//make a recusrive call to continue drawing the line
				this.lineTo(startX, startY);
			}
		}
		else {
			//we go off the bottom
			var destY = canvas.height;//canvas.y + canvas.height;
			var destX = vertical ? startX : this.xCoord(slope, origin, destY);
			
			//draw the line and update our current position
			canvas.context.lineTo(destX, destY);
			canvas.currentPosition = {x: destX, y: destY};
			
			//work out the next canvas
			if (canvas.y + canvas.height < this.canvas.height) {
				//only set up the next canvas if there actually is one
				var nextCanvas = this.canvas.getCanvasAtHeight(canvas.y + canvas.height);
				nextCanvas.context.moveTo(destX, 0);
				
				this.drawingCanvas = nextCanvas;
				
				//make a recusrive call to continue drawing the line
				this.lineTo(startX, startY);
			}
		}
	}
};
BrowserIndependentContext.prototype.xCoord = function(slope, origin, yCoord) {
  //FIXME:  make sure I haven't forgotten how algebra works:
	//  (origin.y - yCoord) / (origin.x - ?) = slope
	//  (origin.y - yCoord) = (slope * origin.x) - (slope * ?)
	//  (origin.y - yCoord) / slope = origin.x - ?
	//  ((origin.y - yCoord) / slope) + origin.x = -?
	//  ? = -1 * (((origin.y - yCoord) / slope) + origin.x)
	return (((origin.y - yCoord) / slope) + origin.x) * -1;
};

//these ones just pass through to all canvas elements
BrowserIndependentContext.prototype.clip = function() {
	for (var index = 0; index < this.canvas.canvasElems.length; index++) {
		this.applySettings(this.canvas.canvasElems[index].context);
    	this.canvas.canvasElems[index].context.clip();
    }
};
BrowserIndependentContext.prototype.fill = function() {
	for (var index = 0; index < this.canvas.canvasElems.length; index++) {
		this.applySettings(this.canvas.canvasElems[index].context);
    	this.canvas.canvasElems[index].context.fill();
    }
};
BrowserIndependentContext.prototype.beginPath = function() {
	for (var index = 0; index < this.canvas.canvasElems.length; index++) {
		this.applySettings(this.canvas.canvasElems[index].context);
		this.canvas.canvasElems[index].context.beginPath();
		this.canvas.canvasElems[index].currentPosition = undefined;
		this.drawingCanvas = undefined;
    }
};
BrowserIndependentContext.prototype.closePath = function() {
	for (var index = 0; index < this.canvas.canvasElems.length; index++) {
		this.applySettings(this.canvas.canvasElems[index].context);
    	this.canvas.canvasElems[index].context.closePath();
    }
};
BrowserIndependentContext.prototype.save = function() {
    for (var index = 0; index < this.canvas.canvasElems.length; index++) {
    	this.applySettings(this.canvas.canvasElems[index].context);
    	this.canvas.canvasElems[index].context.save();
    }
};
BrowserIndependentContext.prototype.restore = function() {
	for (var index = 0; index < this.canvas.canvasElems.length; index++) {
		this.applySettings(this.canvas.canvasElems[index].context);
    	this.canvas.canvasElems[index].context.restore();
    }
};

//not currently implemented (or used by html2canvas?)
//XXX:  some of these may be difficult (or even impossible) to translate across multiple canvas elements
BrowserIndependentContext.prototype.createLinearGradient = function(startX, startY, endX, endY) {
    //FIXME:  implement createLinearGradient
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.createPattern = function(image, repeatOptions) {
    //FIXME:  implement createPattern
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.createRadialGradient = function(startX, startY, startRadius, endX, endY, endRadius) {
    //FIXME:  implement createRadialGradient
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.addColorStop = function(stopPercent, cssColor) {
    //FIXME:  implement addColorStop
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.rect = function(startX, startY, width, height) {
    //FIXME:  implement rect
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.strokeRect = function(startX, startY, width, height) {
    //FIXME:  implement strokeRect
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.clearRect = function(startX, startY, width, height) {
    //FIXME:  implement clearRect
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.stroke = function() {
    //FIXME:  implement stroke
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.quadraticCurveTo = function(controlX, controlY, endX, endY) {
    //FIXME:  implement quadraticCurveTo
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.bezierCurveTo = function(controlX1, controlY1, controlX2, controlY2, endX, endY) {
    //FIXME:  implement bezierCurveTo
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.arc = function(startX, startY, radius, startRadians, endRadians, counterclockwise) {
    //FIXME:  implement arc
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.arcTo = function(startX, startY, endX, endY, arcRadius) {
    //FIXME:  implement arcTo
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.isPointInPath = function(startX, startY) {
    //FIXME:  implement isPointInPath
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.scale = function(widthPercent, heightPercent) {
    //FIXME:  implement scale
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.rotate = function(radians) {
    //FIXME:  implement rotate
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.translate = function(shiftX, shiftY) {
    //FIXME:  implement translate
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.transform = function(scaleX, skewX, skewY, scaleY, shiftX, shiftY) {
    //FIXME:  implement transform
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.setTransform = function(scaleX, skewX, skewY, scaleY, shiftX, shiftY) {
    //FIXME:  implement setTransform
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.strokeText = function(text, startX, startY, maxWidth) {
    //FIXME:  implement strokeText
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
BrowserIndependentContext.prototype.measureText = function(text) {
    //FIXME:  implement measureText
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
//FIXME:  note that parameters are interpreted differently depending upon the number of arguments provided        
BrowserIndependentContext.prototype.createImageData = function(widthOrImage, height) {
    //FIXME:  implement createImageData
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
        
//FIXME:  is this meant to be part of the canvas???        
//FIXME:  arguments???
BrowserIndependentContext.prototype.createEvent = function() {
    //FIXME:  implement createEvent
    var name = this.functionName(this, arguments.callee);
    console.log(name);
        
    calledMethods[name] = true;
};
        
//private API        
BrowserIndependentContext.prototype.applySettings = function(context) {
    //apply our current options to the provided context
    for (var index = 0; index < this.configurationProperties.length; index++) {
        var prop = this.configurationProperties[index];
        context[prop] = this[prop];
    }
};
BrowserIndependentContext.prototype.functionName = function(obj, fun) {
	for (var key in obj) {
		if (obj[key] && obj[key].toString && obj[key].toString() == fun.toString()) {
			return key;
		}
	}  
	
	var ret = fun.toString();
	ret = ret.substr('function '.length);
	ret = ret.substr(0, ret.indexOf('('));
	return ret;
};
BrowserIndependentContext.prototype.heightOfFont = function(font) {
	if (! font && ! this.font) {
		return 12;
	}
	if (! font) {
		font = this.font;
	}
	
    var pointsToPixels = 4.0 / 3.0;
    var emsToPoints = 12;
    var percentToPoints = 0.12;
    
    font = font.toLowerCase();
    var fontSize = font.match(/[0-9]+(px|em|pt|%)/g)[0];
    if (! fontSize) {
    	return 12;
    }
    
    var points = fontSize.indexOf("px") == -1;
    var ems = fontSize.indexOf("em") != -1;
    var percent = fontSize.indexOf("%") != -1;
    
    var size = parseInt(fontSize, 10);
    if (ems) {
    	size *= emsToPoints;
    }
    if (percent) {
    	size *= percentToPoints;
    }
    if (points) {
        size *= pointsToPixels;
    }
    
    return size;
};

//browser-independent canvas implementation; establishes a list of <canvas> elements to accommodate arbitrarily large canvas sizes
function BrowserIndependentCanvas(width, height, maxCanvasSize) {
    this.width = width;
    this.height = height;
    
    this.maxCanvasSize = maxCanvasSize ? maxCanvasSize : BrowserIndependentContext.maximumSupportedCanvasSize;  
    if (this.maxCanvasSize > BrowserIndependentContext.maximumSupportedCanvasSize) {
    	console.log("WARN:  Requested canvas size exceeds detected browser limitations; falling back to safe size! (requestedSize=" + maxCanvasSize + ", maxSize=" + BrowserIndependentContext.maximumSupportedCanvasSize + ")");
    	this.maxCanvasSize = BrowserIndependentContext.maximumSupportedCanvasSize;
    }
    
    if (width > maxCanvasSize) {
        console.log("ERROR:  The width provided is too large to support; width=" + width + ", maxWidth=" + maxCanvasSize);
    }
    
    //set up a list of canvas elements for us to draw to
    var offset = 0;
    this.canvasElems = [];
    while (height > 0) {
        var canvas = document.createElement("canvas");
        canvas.width = this.width;
        canvas.height = height > this.maxCanvasSize ? this.maxCanvasSize : height;
        canvas.y = offset;
        
        this.canvasElems.push(canvas);
        
        height -= canvas.height;
        offset += canvas.height;
    }
    
    this.context = new BrowserIndependentContext(this);
}
 
BrowserIndependentCanvas.prototype.getCanvasAtHeight = function(height) {
    if (height > this.height) {
        //invalid location
        return undefined;
    }
    
    for (var index = 0; index < this.canvasElems.length; index++) {
        var startHeight = index * this.maxCanvasSize;
        var endHeight = startHeight + this.maxCanvasSize;
        if (startHeight <= height && endHeight > height) {
            return this.canvasElems[index];
        }
    }
    
    return undefined;
};

BrowserIndependentCanvas.prototype.getContext = function(contextType) {
    return this.context;
};

BrowserIndependentCanvas.prototype.toDataURL = function() {
    //FIXME:  implement toDataURL (this will be very complicated if we exceed the browser's supported maximum canvas size)
	return null;
};
