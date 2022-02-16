#!/usr/bin/env bash
set -eu
export AWS_PROFILE=carboni

# Delete ECR images
repositories=(
    pkavs
)

for repository in "${repositories[@]}"
do
    FOUND_IMAGES=$( aws ecr list-images --region eu-west-2 --repository-name $repository --query 'imageIds[*]' --output text  || true )
    if [ ! -z "$FOUND_IMAGES" ]
    then
        echo "Deleting all images from $repository:"
        IMAGES_TO_DELETE=$( aws ecr list-images --region eu-west-2 --repository-name $repository --query 'imageIds[*]' --output json)
        aws ecr batch-delete-image --region eu-west-2 --repository-name $repository --image-ids "$IMAGES_TO_DELETE"
    else
        echo "$repository is clear of images."
    fi
done

# Delete the stack
echo "Deleting stack..."
aws cloudformation delete-stack --stack-name pkavs
echo "Waiting for delete to complete..."
time \
aws cloudformation wait stack-delete-complete --stack-name pkavs || \
echo "retrying delete..." && \
aws cloudformation delete-stack --stack-name pkavs && \
echo "Delete succeeded on second round."
echo "The End."
