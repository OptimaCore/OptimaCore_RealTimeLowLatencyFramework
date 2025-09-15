{
  "metadata": {
    "git_commit": "{{ .git_commit }}",
    "terraform_version": "{{ .terraform_version }}",
    "start_ts": "{{ .start_ts }}",
    "region": "{{ .region }}",
    "variant": "{{ .variant }}",
    "environment": "{{ .environment | default "development" }}",
    "description": "{{ .description | default "" }}"
  },
  "parameters": {
    // Add experiment-specific parameters here
  },
  "metrics": {
    // Define your metrics collection points here
  },
  "results": {
    // Results will be populated after experiment completion
  }
}
