package access.sod

default allow = true

deny[msg] {
  input.roles[_] == "FI Admin"
  input.roles[_] == "AP Payments"
  msg := "SoD violation: FI Admin + AP Payments"
}
