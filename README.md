### wrapped-canvas
######An HTML5 canvas wrapper geared towards cross-browser consistency
=========


### Usage

To use this code, simply include 'wrapped-canvas.js' in your page/application context using whatever method you prefer, and then use `new BrowserIndependentCanvas(width, height)` wherever you want to work with an unlimited/cross-browser canvas.

You can then call `getContext('2d')` on your `BrowserIndependentCanvas` instance to get a `BrowserIndependentContext` instance, which you can draw on using the exact same API's as a native canvas/context instance.

### Limitations

There are a few limitations to be aware of when using this class:

1.  Many of the [core drawing API's](http://www.w3schools.com/tags/ref_canvas.asp) are currently UNIMPLEMENTED.   Any calls to unimplemented drawing API's will be ignored and obviously result in incorrect rendering.  You can check your browser's JavaScript console to see if any calls are being ignored, and/or inspect the `window.calledMethods` object for a complete list of unimplemented calls.

2.  You cannot append a `BrowserIndependentCanvas` element directly to the DOM.  It doesn't live there.  What you can do, however, is access the `canvasElems` property (it's an `Array`) and append each canvas element to the DOM individually. 

3.  Unbounded canvas sizes are only supported vertically.  The maximum horizontal dimensions of a `BrowserIndependentCanvas` element will still be fixed at whatever the browser's intrinsic limit happens to be.  Horizontal scrolling is terrible UX anyways, so hopefully this should not be a problem.

4.  Don't expect `toDataUrl()` to work anytime soon.


### FAQ

**_Why create this utility?_**<br />
Because I needed to export large and arbitrarily formatted documents (webpages) to PDF using a combination of [html2canvas](https://github.com/niklasvh/html2canvas) and [jsPDF](https://github.com/MrRio/jsPDF).  Long story short, I started running into issues caused by the browser's internal limits on maximum canvas dimensions.  One browser in particular was very problematic, as its maximum supported canvas dimensions were only 25% of what most other browsers would allow.  

So this project was created in an attempt to work around the problem in a way that completely hides any browser imposed limitations on canvas dimensions along the y-axis.  Especially for that one browser that tends to lag behind every single other browser in capabilities and standards compliance.

**_Why should I use this library?_**<br />
This library will allow you to programmatically interact with a "canvas" element that exceeds the browser's maximum allowed canvas size.  Use it if that sounds like something you'd want to do.

**_Why should I NOT use this library?_**<br />
Don't use this code if you need access to drawing API's that are currently unimplemented (unless you feel like coding them yourself), or canvas elements that scale arbitrarily along the x-axis.  Also don't use it if your use-case doesn't require canvas elements so large that they exceed the browser's intrinsic limits.  It's best to work with a single native canvas element wherever possible.  

**_Why are so many drawing API's unimplemented?_**<br />
Because my use-case involved integrating this project with html2canvas, so it was only necessary to implement the drawing API's that html2canvas actually uses.  Which thankfully happened to be only a small subset of the complete API.  

Some API calls (such as `createLinearGradient`) may be quite difficult to correctly translate across multiple canvas elements.  Others (such as `createRadialGradient`) may be completely impossible to translate without resorting to manually coloring each pixel in the backing canvas elements.  

Please feel free to implement any unimplemented API calls that you need for your own use-case, and submit a pull request when you're done.

**_What are your license terms?_**<br />
Use this code if you want, otherwise don't.  That's it.  

For the sake of simplicity, you may consider all wrapped-canvas code to be licensed under the terms of the MIT license. Or if you prefer, the Apache license. Or CC BY. Or any other permissive open-source license (the operative word there being "permissive"). Take your pick.
