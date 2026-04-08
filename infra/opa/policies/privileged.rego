package access.privileged

default flag = false

flag {
  input.role == "Global Admin"
}

message := "Privileged role requires enhanced review" if {
  input.role == "Global Admin"
}
