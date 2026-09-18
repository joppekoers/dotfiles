#!/usr/bin/env bash
# ./envcrypt.sh lock    .env -> .env.enc, staged
# ./envcrypt.sh unlock  .env.enc -> .env
set -e
case "$1" in
lock) age -p -a -o .env.enc .env && git add .env.enc ;;
unlock) age -d -o .env .env.enc ;;
*) echo "usage: $0 lock|unlock" ;;
esac
