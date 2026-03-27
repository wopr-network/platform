#!/bin/bash

source .venv/bin/activate

run_experiment() {
    local description="$1"
    echo "Starting experiment: $description"
    
    # Run training
    python train.py --epochs 50 --probe-epochs 5 --batch-size 128 --dataset dataset-final.jsonl --output /tmp/autoresearch-model.onnx > run.log 2>&1
    
    # Extract MAE
    mae=$(grep "Best val MAE" run.log | tail -1 | awk '{print $NF}')
    
    # Check for crash
    if [ -z "$mae" ]; then
        mae="9.999999"
    fi
    
    # Get GPU memory (from log if available, else 0.0)
    gpu=$(grep "allocated" run.log | head -1 | grep -oP '\d+\.\d+' | head -1)
    if [ -z "$gpu" ]; then
        gpu="0.0"
    fi
    
    # Get commit hash
    commit=$(git rev-parse --short HEAD)
    
    # Determine status
    last_mae=$(tail -2 results.tsv | head -1 | awk '{print $2}')
    if [ "$mae" = "9.999999" ]; then
        status="crash"
    elif (( $(echo "$mae < $last_mae" | bc -l) )); then
        status="keep"
        git add train.py && git commit -m "experiment: $description"
    else
        status="discard"
        git reset --hard HEAD~1
    fi
    
    # Log result
    echo -e "$commit\t$mae\t$gpu\t$status\t$description" >> results.tsv
    
    echo "Result: $status (MAE: $mae)"
    echo ""
}

# Ensure header exists
if [ ! -f results.tsv ] || [ $(wc -l < results.tsv) -eq 0 ]; then
    echo -e "commit\tval_mae\tgpu_gb\tstatus\tdescription" > results.tsv
fi

# Start experiments
echo "=== AUTORESEARCH EXPERIMENT LOOP ==="
echo "Current best MAE: 0.1090"
echo ""
