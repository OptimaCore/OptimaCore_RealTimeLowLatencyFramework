#!/bin/bash

# test-budget-webhook.sh - Test Azure Budget Webhook
# This script sends a test notification to a webhook URL to simulate a budget alert

set -e

# Default values
WEBHOOK_URL=""
BUDGET_NAME="Test Budget"
BUDGET_AMOUNT=1000
CURRENT_SPEND=850
THRESHOLD=85
SUBSCRIPTION_ID=""
RESOURCE_GROUP=""
DEBUG=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "[DEBUG] $1"
    fi
}

# Show usage information
usage() {
    echo "Usage: $0 --webhook-url URL [options]"
    echo ""
    echo "Required parameters:"
    echo "  --webhook-url URL     Webhook URL to send the test notification to"
    echo ""
    echo "Options:"
    echo "  --name NAME           Budget name (default: 'Test Budget')"
    echo "  --amount AMOUNT       Budget amount (default: 1000)"
    echo "  --spend AMOUNT        Current spend amount (default: 850)"
    echo "  --threshold PERCENT   Threshold percentage (default: 85)"
    echo "  --subscription ID     Azure subscription ID"
    echo "  --resource-group RG   Resource group name"
    echo "  --debug               Enable debug output"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Basic test with default values"
    echo "  $0 --webhook-url https://example.com/webhook"
    echo ""
    echo "  # Test with custom values"
    echo "  $0 --webhook-url https://example.com/webhook --name 'Prod Budget' --amount 5000 --spend 4500 --threshold 90"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --webhook-url)
            WEBHOOK_URL="$2"
            shift; shift
            ;;
        --name)
            BUDGET_NAME="$2"
            shift; shift
            ;;
        --amount)
            BUDGET_AMOUNT="$2"
            shift; shift
            ;;
        --spend)
            CURRENT_SPEND="$2"
            shift; shift
            ;;
        --threshold)
            THRESHOLD="$2"
            shift; shift
            ;;
        --subscription)
            SUBSCRIPTION_ID="$2"
            shift; shift
            ;;
        --resource-group)
            RESOURCE_GROUP="$2"
            shift; shift
            ;;
        --debug)
            DEBUG=true
            set -x
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required parameters
if [ -z "$WEBHOOK_URL" ]; then
    log_error "Webhook URL is required"
    usage
fi

# Validate amounts are numbers
for var in BUDGET_AMOUNT CURRENT_SPEND THRESHOLD; do
    if ! [[ "${!var}" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
        log_error "$var must be a number"
        exit 1
    fi
done

# Calculate percentage
PERCENTAGE=$(awk "BEGIN {printf \"%.2f\", ($CURRENT_SPEND / $BUDGET_AMOUNT) * 100}")

# Set subscription ID if not provided
if [ -z "$SUBSCRIPTION_ID" ]; then
    SUBSCRIPTION_ID=$(az account show --query id -o tsv 2>/dev/null || echo "")
    if [ -z "$SUBSCRIPTION_ID" ]; then
        log_error "Failed to get subscription ID. Please login to Azure CLI first or provide --subscription parameter."
        exit 1
    fi
    debug "Using current subscription: $SUBSCRIPTION_ID"
fi

# Create a unique operation ID
OPERATION_ID=$(uuidgen)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

# Build the webhook payload
PAYLOAD=$(cat <<EOF
{
    "schemaId": "AIP Budget Notification",
    "data": {
        "budgetName": "$BUDGET_NAME",
        "budgetAmount": $BUDGET_AMOUNT,
        "budgetStartDate": "$(date -d "-1 month" -u +"%Y-%m-01T00:00:00.000Z")",
        "budgetEndDate": "$(date -u +"%Y-%m-01T00:00:00.000Z" -d "+1 month")",
        "budgetType": "Cost",
        "notificationThresholdAmount": $THRESHOLD,
        "spentAmount": $CURRENT_SPEND,
        "spentPercentage": $PERCENTAGE,
        "currentSpend": $CURRENT_SPEND,
        "currentSpendPercentage": $PERCENTAGE,
        "budgetId": "/subscriptions/$SUBSCRIPTION_ID${RESOURCE_GROUP:+/resourceGroups/$RESOURCE_GROUP}/providers/Microsoft.Consumption/budgets/$BUDGET_NAME",
        "budget": {
            "id": "/subscriptions/$SUBSCRIPTION_ID${RESOURCE_GROUP:+/resourceGroups/$RESOURCE_GROUP}/providers/Microsoft.Consumption/budgets/$BUDGET_NAME",
            "name": "$BUDGET_NAME",
            "type": "Microsoft.Consumption/budgets",
            "properties": {
                "category": "Cost",
                "amount": $BUDGET_AMOUNT,
                "timeGrain": "Monthly",
                "timePeriod": {
                    "startDate": "$(date -d "-1 month" -u +"%Y-%m-01T00:00:00.000Z")",
                    "endDate": "$(date -u +"%Y-%m-01T00:00:00.000Z" -d "+1 month")"
                },
                "currentSpend": {
                    "amount": $CURRENT_SPEND,
                    "unit": "USD"
                },
                "notifications": {
                    "Actual": {
                        "enabled": true,
                        "operator": "GreaterThanOrEqualTo",
                        "threshold": $THRESHOLD,
                        "contactEmails": ["recipient@example.com"],
                        "contactRoles": ["Owner"],
                        "contactGroups": []
                    }
                }
            }
        },
        "notificationType": "Actual",
        "thresholdType": "Actual",
        "message": "Budget threshold notification for $BUDGET_NAME. You've used $PERCENTAGE% of your budget.",
        "subscriptionId": "$SUBSCRIPTION_ID",
        "resourceGroupName": "$RESOURCE_GROUP"
    }
}
EOF
)

# Send the webhook
log_info "Sending test budget notification to webhook..."
log_info "Budget: $BUDGET_NAME ($$BUDGET_AMOUNT)"
log_info "Current spend: $$CURRENT_SPEND ($PERCENTAGE% of budget)"
log_info "Threshold: $THRESHOLD%"

# Use curl to send the webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL" 2>/dev/null)

# Extract status code and response body
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

# Check if the request was successful
if [[ $HTTP_STATUS -ge 200 && $HTTP_STATUS -lt 300 ]]; then
    log_info "Webhook sent successfully (Status: $HTTP_STATUS)"
    if [ "$DEBUG" = true ]; then
        echo -e "${YELLOW}Response:${NC}"
        echo "$RESPONSE_BODY" | jq .
    fi
else
    log_error "Failed to send webhook (Status: $HTTP_STATUS)"
    if [ -n "$RESPONSE_BODY" ]; then
        echo -e "${YELLOW}Error details:${NC}"
        echo "$RESPONSE_BODY" | jq . 2>/dev/null || echo "$RESPONSE_BODY"
    fi
    exit 1
fi

exit 0
