cat previous-work.txt | grep -v '^$' | xargs -I {} bash ./run.sh {}
