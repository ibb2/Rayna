`httplib.h` is cpp-httplib 0.18.1 by Yuji Hirose, distributed under the MIT
license in this directory. It is used only for a loopback HTTP server; TLS and
upstream HTTP are handled by the operating system's curl executable.
The vendored copy suppresses SIGPIPE per socket rather than changing the host
process's signal handler.
