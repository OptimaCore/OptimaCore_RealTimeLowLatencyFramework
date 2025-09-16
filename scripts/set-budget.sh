#!/bin/bash

# set-budget.sh - Azure Budget Management Script
# This script creates or updates an Azure budget with configurable alerts and actions

set -e

# Default values
SUBSCRIPTION_ID=""
BUDGET_NAME=""
BUDGET_AMOUNT=0
RESOURCE_GROUP=""
START_DATE=$(date +%Y-%m-01)  # First day of current month
END_DATE=$(date -d "+1 year" +%Y-%m-01)  # One year from now
TIME_GRAIN="Monthly"
CONTACT_EMAILS=()
ACTION_GROUPS=()
THRESHOLDS=(50 80 100)  # Default threshold percentages
FILTERS=""
DRY_RUN=false
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
    echo "Usage: $0 --name NAME --amount AMOUNT [options]"
    echo ""
    echo "Required parameters:"
    echo "  -n, --name NAME          Name of the budget"
    echo "  -a, --amount AMOUNT       Budget amount in USD"
    echo ""
    echo "Options:"
    echo "  -s, --subscription ID     Azure subscription ID (default: current subscription)"
    echo "  -g, --resource-group RG   Resource group to scope the budget (default: subscription level)"
    echo "  --start-date DATE         Start date in YYYY-MM-DD format (default: first day of current month)"
    echo "  --end-date DATE           End date in YYYY-MM-DD format (default: one year from now)"
    echo "  --time-grain GRAIN        Time grain: Monthly, Quarterly, Annually (default: Monthly)"
    echo "  --email EMAIL             Email address to send alerts to (can be specified multiple times)"
    echo "  --action-group ID         Action group ID for alerts (can be specified multiple times)"
    echo "  --thresholds N1,N2,...    Comma-separated list of threshold percentages (default: 50,80,100)"
    echo "  --filter FILTER           JMESPath filter for resources (e.g., \"tag eq 'environment=production'\")"
    echo "  --dry-run                 Show what would be done without making changes"
    echo "  --debug                   Enable debug output"
    echo "  -h, --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  # Create a monthly budget of $1000 for a resource group"
    echo "  $0 --name dev-budget --amount 1000 --resource-group my-rg"
    echo ""
    echo "  # Create a budget with custom thresholds and notifications"
    echo "  $0 --name prod-budget --amount 5000 --email admin@example.com --thresholds 30,70,90"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -n|--name)
            BUDGET_NAME="$2"
            shift; shift
            ;;
        -a|--amount)
            BUDGET_AMOUNT="$2"
            shift; shift
            ;;
        -s|--subscription)
            SUBSCRIPTION_ID="$2"
            shift; shift
            ;;
        -g|--resource-group)
            RESOURCE_GROUP="$2"
            shift; shift
            ;;
        --start-date)
            START_DATE="$2"
            shift; shift
            ;;
        --end-date)
            END_DATE="$2"
            shift; shift
            ;;
        --time-grain)
            TIME_GRAIN="$2"
            shift; shift
            ;;
        --email)
            CONTACT_EMAILS+=("$2")
            shift; shift
            ;;
        --action-group)
            ACTION_GROUPS+=("$2")
            shift; shift
            ;;
        --thresholds)
            IFS=',' read -r -a THRESHOLDS <<< "$2"
            shift; shift
            ;;
        --filter)
            FILTER="$2"
            shift; shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
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
if [ -z "$BUDGET_NAME" ] || [ -z "$BUDGET_AMOUNT" ]; then
    log_error "Budget name and amount are required"
    usage
fi

# Validate amount is a number
if ! [[ "$BUDGET_AMOUNT" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    log_error "Budget amount must be a number"
    exit 1
fi

# Validate time grain
if ! [[ "$TIME_GRAIN" =~ ^(Monthly|Quarterly|Annually)$ ]]; then
    log_error "Time grain must be one of: Monthly, Quarterly, Annually"
    exit 1
fi

# Validate thresholds
for threshold in "${THRESHOLDS[@]}"; do
    if ! [[ "$threshold" =~ ^[0-9]+$ ]] || [ "$threshold" -lt 1 ] || [ "$threshold" -gt 100 ]; then
        log_error "Thresholds must be integers between 1 and 100"
        exit 1
    fi
done

# Sort thresholds in ascending order
IFS=$'\n' THRESHOLDS=($(sort -n <<<"${THRESHOLDS[*]}"))
unset IFS

# Build the base command
BASE_CMD="az consumption budget"
if [ -n "$SUBSCRIPTION_ID" ]; then
    BASE_CMD="$BASE_CMD --subscription $SUBSCRIPTION_ID"
fi

# Set the scope
SCOPE="/subscriptions/$(az account show --query id -o tsv)"
if [ -n "$RESOURCE_GROUP" ]; then
    SCOPE="$SCOPE/resourceGroups/$RESOURCE_GROUP"
fi

# Check if budget already exists
get_budget() {
    $BASE_CMD show --name "$BUDGET_NAME" --resource-group "${RESOURCE_GROUP}" --output json 2>/dev/null || echo ""
}

BUDGET_EXISTS=$(get_budget)

# Prepare notifications
NOTIFICATIONS=()
for threshold in "${THRESHOLDS[@]}"; do
    NOTIFICATION={\"enabled\":true,\"operator\":\"GreaterThan\",\"threshold\":$threshold,\"contactEmails\":[
    
    # Add contact emails if any
    if [ ${#CONTACT_EMAILS[@]} -gt 0 ]; then
        for email in "${CONTACT_EMAILS[@]}"; do
            NOTIFICATION+="\"$email\","
        done
        NOTIFICATION=${NOTIFICATION%?}  # Remove trailing comma
    fi
    
    NOTIFICATION+="],\"contactRoles\":[\"Owner\"],\"contactGroups\":[
    
    # Add action groups if any
    if [ ${#ACTION_GROUPS[@]} -gt 0 ]; then
        for group in "${ACTION_GROUPS[@]}"; do
            NOTIFICATION+="\"$group\","
        done
        NOTIFICATION=${NOTIFICATION%?}  # Remove trailing comma
    fi
    
    NOTIFICATION+="]}"
    NOTIFICATIONS+=("$NOTIFICATION")
done

# Build the create/update command
BUDGET_CMD="$BASE_CMD create --name \"$BUDGET_NAME\" --amount $BUDGET_AMOUNT \
    --time-grain $TIME_GRAIN --start-date $START_DATE --end-date $END_DATE \
    --category Cost --scope \"$SCOPE\" --reset-period $TIME_GRAIN"

# Add notifications
for notification in "${NOTIFICATIONS[@]}"; do
    BUDGET_CMD+=" --notifications \"$notification\""
done

# Add filters if specified
if [ -n "$FILTER" ]; then
    BUDGET_CMD+=" --filters \"$FILTER\""
fi

# Add resource group if specified
if [ -n "$RESOURCE_GROUP" ]; then
    BUDGET_CMD+=" --resource-group \"$RESOURCE_GROUP\""
fi

# Execute or dry run
if [ "$DRY_RUN" = true ]; then
    log_info "[DRY RUN] Would execute:"
    echo "$BUDGET_CMD"
else
    log_info "Creating/updating budget '$BUDGET_NAME' with amount $BUDGET_AMOUNT"
    
    # Check if update is needed
    if [ -n "$BUDGET_EXISTS" ]; then
        log_info "Budget '$BUDGET_NAME' already exists. Updating..."
        BUDGET_CMD=$(echo "$BUDGET_CMD" | sed 's/create/update/g')
    fi
    
    # Execute the command
    eval "$BUDGET_CMD"
    
    if [ $? -eq 0 ]; then
        log_info "Budget '$BUDGET_NAME' created/updated successfully"
    else
        log_error "Failed to create/update budget"
        exit 1
    fi
    
    # Show the created/updated budget
    log_info "Budget details:"
    get_budget | jq .
fi

exit 0
