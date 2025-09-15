# Experiment Manifest
# Generated: ${timestamp()}

git_commit: ${git_commit}
terraform_version: ${terraform_version}
start_ts: ${start_ts}
region: ${region}
variant: ${variant}
experiment_name: ${experiment_name}

# Infrastructure Details
resource_group: ${resource_group_name}
location: ${location}

# Services
services:
  redis:
    enabled: ${enable_redis}
  postgres:
    enabled: ${enable_postgres}
  cosmos:
    enabled: ${enable_cosmos}
  blob_storage:
    enabled: ${enable_blob}

# Budget
budget:
  monthly_amount: ${monthly_budget_amount}
  alert_emails: ${jsonencode(alert_emails)}

# Tags
tags: ${jsonencode(tags)}
