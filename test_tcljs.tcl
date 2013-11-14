# test suite for TclJS
# This file is designed so it can also run in a tclsh. Some JavaScript goodies,
# like 1/0, sqrt(-1) were excluded from the tests.
# [clock format 0] was excluded because the timezone string differed.

set version 0.5.3
set total  0
set passed 0
set fail   0
puts "------------------------ [info script]"

proc e.g. {cmd -> expected} {
    incr ::total
    incr ::fail ;# to also count exceptions
    set mres [uplevel 1 $cmd]
    if [!= $mres $expected] {
	puts "**** $cmd -> $mres, expected $expected"
    } else {incr ::passed; incr ::fail -1}
}
#------------------------------- commands not in real Tcl
if [info exists auto_path] {
    proc func {name argl body} {proc $name $argl [list expr $body]}
    func +   {a b} {$a +  $b}
    func !=  {a b} {$a != $b}
    func *   {a b} {$a *  $b}
    func ==  {a b} {$a == $b}
    func <   {a b} {$a <  $b}
    set noTcl 0
} else {set noTcl 1}


# e.g. {exec echo hello} -> hello

e.g. {append new hello} -> hello
e.g. {set x foo}        -> foo
e.g. {append x bar}     -> foobar

e.g. {set d [dict create a 1 b 2 c 3]} -> {a 1 b 2 c 3}
e.g. {dict get $d b} -> 2
e.g. {dict set d b 5} -> {a 1 b 5 c 3}
e.g. {dict set d x 7} -> {a 1 b 5 c 3 x 7}

e.g. {set home [file dirname [pwd]]; list} -> {}
e.g. {string equal [set env(HOME)] $home}   -> 1
e.g. {string equal [set ::env(HOME)] $home} -> 1

e.g. {expr 6*7}         -> 42
e.g. {expr {6 * 7 + 1}} -> 43
e.g. {set x 43}         -> 43
e.g. {expr {$x-1}}      -> 42
e.g. {expr $x-1}        -> 42
if $noTcl {
    e.g. {clock format 0} -> {Thu Jan 01 1970 01:00:00 GMT+0100 (CET)}
    e.g. {set i [expr 1/0]} -> Infinity
    e.g. {expr $i==$i+42}   -> 1
    e.g. {set n [expr sqrt(-1)]} -> NaN
    e.g. {expr $n == $n} -> 0
    e.g. {expr $n==$n}   -> 0
    e.g. {expr $n!=$n}   -> 1
}
e.g. {expr 0xFF}   -> 255
e.g. {expr 0376}   -> 254
e.g. {expr 6 * 7}  -> 42

e.g. {expr 1 == 2} -> 0
e.g. {expr 1 < 2}  -> 1

set forres ""
e.g. {for {set i 0} {$i < 5} {incr i} {append forres $i}; set forres} -> 01234

e.g. {set x 41}  -> 41
e.g. {incr x}    -> 42
e.g. {incr x 2}  -> 44
e.g. {incr x -3} -> 41

e.g. {info args e.g.} -> {cmd -> expected}
e.g. {unset -nocomplain foo} -> {}
e.g. {info exists foo} -> 0
e.g. {set foo 42}      -> 42
e.g. {info exists foo} -> 1
e.g. {info level}      -> 0 ;# e.g. runs the command one level up
e.g. {info patchlevel} -> $version

e.g. {join {a b c}}     -> {a b c}
e.g. {join {a b c} +}   -> {a+b+c}
e.g. {join {a {b c} d}} -> {a b c d}

e.g. {expr !0}  -> 1
e.g. {expr !42} -> 0

e.g. {regexp {X[ABC]Y} XAY}    -> 1
e.g. {regexp {X[ABC]Y} XDY}    -> 0
e.g. {regsub {[A-C]+} uBAAD x} -> uxD 

e.g. {split "a b  c d"}     -> {a b {} c d}
e.g. {split " a b  c d"}     -> {{} a b {} c d}
e.g. {split "a b  c d "}     -> {a b {} c d {}}
e.g. {split usr/local/bin /} -> {usr local bin}

e.g. {string equal foo foo}   -> 1
e.g. {string equal foo bar}   -> 0
e.g. {string index abcde 2}   -> c
e.g. {string length ""}       -> 0
e.g. {string length foo}      -> 3
e.g. {string range hello 1 3} -> ell
e.g. {string tolower TCL}     -> tcl
e.g. {string toupper tcl}     -> TCL
e.g. {string trim " foo "}    -> foo

e.g. {set x {a b c}} -> {a b c}
e.g. {lappend x d}   -> {a b c d}
e.g. {set x}         -> {a b c d}
e.g. {lset x 3 e}    -> {a b c e}
e.g. {llength $x}    -> 4
e.g. {lindex $x 2}   -> c
e.g. {lrange $x 1 2} -> {b c}
e.g. {lsearch $x b}  -> 1
e.g. {lsearch $x y}  -> -1
e.g. {lsort {z x y}} -> {x y z}

e.g. {proc f x {set y 0; info vars}} -> ""
e.g. {f 41} -> {x y} ;# must fix proc call in uplevel issue
set tmp [f 41]; e.g. {set tmp} -> {x y}
e.g. {info args f} -> x
e.g. {info body f} -> {set y 0; info vars}
#e.g. {f 42} -> {x y} ;# must fix proc call in uplevel issue

puts "total $total tests, passed $passed, failed $fail"
