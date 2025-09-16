variable "budget_name" {
  description = "The name of the budget"
  type        = string
}

variable "budget_amount" {
  description = "The amount of the budget"
  type        = number
}

variable "time_grain" {
  description = "The time covered by a budget. Valid values include Monthly, Quarterly, Annually, BillingMonth, BillingQuarter, BillingAnnual, or Custom."
  type        = string
  default     = "Monthly"
  
  validation {
    condition     = contains(["Monthly", "Quarterly", "Annually", "BillingMonth", "BillingQuarter", "BillingAnnual", "Custom"], var.time_grain)
    error_message = "The time_grain must be one of: Monthly, Quarterly, Annually, BillingMonth, BillingQuarter, BillingAnnual, or Custom."
  }
}

variable "start_date" {
  description = "The start date of the budget in YYYY-MM-DD format. If not provided, defaults to the first day of the current month."
  type        = string
  default     = null
}

variable "end_date" {
  description = "The end date of the budget in YYYY-MM-DD format. If not provided, defaults to 10 years from now."
  type        = string
  default     = null
}

variable "notifications" {
  description = "List of notifications to be sent when budget is exceeded"
  type = list(object({
    enabled        = bool
    threshold      = number
    operator       = string
    threshold_type = string
    contact_emails = list(string)
    action_group_ids = optional(list(string))
    contact_roles  = optional(list(string))
  }))
  
  validation {
    condition = alltrue([
      for n in var.notifications : contains(["EqualTo", "GreaterThan", "GreaterThanOrEqualTo"], n.operator)
    ])
    error_message = "The operator must be one of: EqualTo, GreaterThan, or GreaterThanOrEqualTo."
  }
  
  validation {
    condition = alltrue([
      for n in var.notifications : contains(["Actual", "Forecasted"], n.threshold_type)
    ])
    error_message = "The threshold_type must be either Actual or Forecasted."
  }
}

variable "filters" {
  description = "Filter the budget by resources, resource groups, or tags"
  type = object({
    dimensions = optional(list(object({
      name     = string
      operator = string
      values   = list(string)
    })))
    tags = optional(list(object({
      name     = string
      operator = string
      values   = list(string)
    })))
  })
  default = null
}

variable "tags" {
  description = "A mapping of tags to assign to the budget"
  type        = map(string)
  default     = {}
}
