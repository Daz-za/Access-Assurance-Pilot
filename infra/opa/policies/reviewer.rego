package access.reviewer

default allow = false

allow {
  input.reviewer_department == input.user_department
}

reason := "Reviewer must belong to the same department as the user" if {
  not allow
}
