use strict; use warnings;
my $path = "assets/map-D2GUsbT3.js";
open(my $f, "<:raw", $path) or die;
my $s = do { local $/; <$f> };
close $f;

my $r1 = 'R.on(`moveend`,()=>{je(`DBG:moveend mode=\$__regionMode__`),__autoRegion__()});setTimeout(()=>{let b=document.createElement(`button`);b.textContent=`DBG:aefin`;b.style.cssText=`position:fixed;top:50%;left:50%;z-index:9999;padding:12px 24px;font-size:20px`;document.body.appendChild(b),R.fire(`moveend`)},2500);';
my $n1 = 'R.on(`moveend`,__autoRegion__);';
my $r2 = 'je(`DBG:auto center=\${e.lng.toFixed(1)},\${e.lat.toFixed(1)} reg=\$t mode=\$__regionMode__ active=\$__activeReg__`),__setRegion__(t)}';
my $n2 = '__setRegion__(t)}';

my $i = index($s, $r1);
die "dbg1 not found" if $i < 0;
substr($s, $i, length($r1)) = $n1;
my $j = index($s, $r2);
die "dbg2 not found" if $j < 0;
substr($s, $j, length($r2)) = $n2;

open(my $o, ">:raw", $path) or die;
print $o $s;
close $o;
my $left = () = $s =~ /DBG/g;
print "cleaned; DBG refs left: $left\n";
