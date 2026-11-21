#!/usr/bin/env bash
# Sanity check: each start repo fails its hidden tests, each reference passes visible + hidden.
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$R/runs"; W=$(mktemp -d -p "$R/runs" check.XXXX)
run() { # name startdir refdir hidden
  local d=$W/$1; rm -rf $d; cp -r "$R/$2" $d; [ -n "$3" ] && cp -r "$R/$3/." $d/; cp "$R"/harness/hidden/$4/*.ts $d/test/
  (cd $d && node --test --test-reporter=tap 'test/*.test.ts' 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '); echo " <- $1"
}
run t1-start fixture "" t1; run t1-ref fixture harness/reference/t1 t1
run t2-start fixture "" t2; run t2-ref fixture harness/reference/t2 t2
run t3-start fixture "" t3; run t3-ref fixture harness/reference/t3 t3
run ag-start fixture-agent "" agent; run ag-ref fixture-agent harness/reference/agent agent
(cd "$R/fixture-agent" && node --test --test-reporter=tap 'test/*.test.ts' 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '); echo " <- agent start visible only"
rm -rf "$W"
