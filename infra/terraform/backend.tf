# Remote state in S3 with native state locking (Terraform >= 1.10, no DynamoDB).
# Values are supplied per environment:
#   terraform init -backend-config=environments/dev.s3.tfbackend
# Create the bucket once with ./bootstrap.
terraform {
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}
