tcl.js "A Tcl implementation in Javascript"

 * Released under the same terms as Tcl itself.
 * (BSD license found at <http://www.tcl.tk/software/tcltk/license.html>)
 *
 * Based on Picol by Salvatore Sanfilippo (<http://antirez.com/page/picol>)
 * (c) Stéphane Arnold 2007
 * Richard Suchenwirth 2007, 2013: cleanup, additions

This emulates (in part) an interpreter for the Tcl scripting language. Early versions were tested in browsers, but since the advent of node.js, I only use that, like a tclsh (interactive or with script file(s) to evaluate).

The test suite is also frequently tested against a real tclsh, currently 8.5.13. Only a few tests dealing with special numbers (Infinity, NaN) are skipped when real Tcl runs.

The tcljs project has a home at http://code.google.com/p/tcl-js/. 
Version control via mercurial (hg). 
Also via Fossil at https://chiselapp.com/user/suchenwi/repository/tcl-js/dir?ci=tip

I used to develop this with node.js v0.6.19 (which was standard via apt-get). Now that backslash escapes are finally working, the test suite (which is in UTF-8) needs to be parsed as such, so I upgraded to node.js v0.10.22.

On the command line you can pass code snippets that are executed before the Read-Eval-Print loop is entered For instance, this runs the test suite:

$ DEBUG=0 node tcl053.js "source /home/suchenwi/tcl-js/test_tcljs.tcl"

With DEBUG=1, all commands are reported before execution, and all exceptions.

Still missing:
- blocking [exec]
- blocking [gets]
- [expr] to also accept command calls in braced expressions, e.g.
        if {[llength $x] > 2} ...
- [open], [puts] to file, [close]
-
- and many more...
