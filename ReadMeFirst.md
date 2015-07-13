# Introduction #

The original tcl.js from 2007 was made to run (rather slowly) in browsers (I had IE6 at that time).
This new version was made to run in the node.js interpreter locally. No particular support for browsers (yet). Use it as you would a tclsh, although it offers less features than a tclsh...

To run the test suite:
$ nodejs tcl053.js "source test\_tcljs.tcl"

On my machine, this currently displays:
```
------------------------ test_tcljs.tcl
[TypeError: Cannot set property 'mres' of null]
total 74 tests, passed 73, failed 0
% 
```
The one exception (not yet counted as failed) comes from [issue #2](https://code.google.com/p/tcl-js/issues/detail?id=#2) (running a proc in uplevel). I haven't commented it out, as I want to be constantly reminded of it :)

After the test suite, you're at the Tcl-js "%" prompt, and can make further experiments interactively, or type Exit

&lt;Return&gt;

 or just Ctrl-D.




# Details #

Add your content here.  Format your content with:
  * Text in **bold** or _italic_
  * Headings, paragraphs, and lists
  * Automatic links to other wiki pages