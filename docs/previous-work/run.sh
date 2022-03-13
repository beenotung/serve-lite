echo "run: $1"
npm-size "$1" 2>&1 > "size-$1.txt"
