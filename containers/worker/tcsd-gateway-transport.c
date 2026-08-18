#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef SECRET_FILE
#define SECRET_FILE "/run/secrets/tcsd-gateway.env"
#endif
#ifndef SATK_SCRIPT
#define SATK_SCRIPT "/opt/sdg/app/skills/hermes/tcsd-runtime/scripts/satk_eval.py"
#endif
#ifndef LEASE_SCRIPT
#define LEASE_SCRIPT "/opt/sdg/app/skills/hermes/software-detail-runtime/scripts/matlab_gateway_lease.py"
#endif
#ifndef REQUIRE_ROOT_OWNER
#define REQUIRE_ROOT_OWNER 1
#endif
#ifndef PYTHON_EXECUTABLE
#define PYTHON_EXECUTABLE "/usr/local/bin/python3"
#endif
#ifndef TRANSPORT_GID
#define TRANSPORT_GID 10002
#endif

static const char *controlled_script(const char *script) {
  char resolved[4096];
  if (!realpath(script, resolved)) return NULL;
  if (strcmp(resolved, SATK_SCRIPT) == 0) return SATK_SCRIPT;
  if (strcmp(resolved, LEASE_SCRIPT) == 0) return LEASE_SCRIPT;
  return NULL;
}

static void sanitize_python_environment(void) {
  const char *names[] = {
    "PYTHONBREAKPOINT", "PYTHONHOME", "PYTHONINSPECT", "PYTHONPATH",
    "PYTHONSTARTUP", "PYTHONUSERBASE", "PYTHONWARNINGS", NULL,
  };
  for (size_t index = 0; names[index]; ++index) unsetenv(names[index]);
  setenv("PYTHONNOUSERSITE", "1", 1);
  setenv("PYTHONSAFEPATH", "1", 1);
}

static void load_secret_file(void) {
  struct stat metadata;
  char line[8192];
  if (stat(SECRET_FILE, &metadata) != 0 || !S_ISREG(metadata.st_mode) ||
      (REQUIRE_ROOT_OWNER && metadata.st_uid != 0) || metadata.st_gid != TRANSPORT_GID ||
      (metadata.st_mode & 0037) != 0) {
    fputs("tcsd-gateway-transport: Gateway credential file permissions are unsafe\n", stderr); exit(77);
  }
  FILE *file = fopen(SECRET_FILE, "r");
  if (!file) { perror("tcsd-gateway-transport: Gateway credential file is unavailable"); exit(77); }
  while (fgets(line, sizeof(line), file)) {
    char *equals = strchr(line, '=');
    char *value;
    if (!equals || line[0] == '#' || line[0] == '\n') continue;
    *equals = '\0'; value = equals + 1;
    value[strcspn(value, "\r\n")] = '\0';
    if ((strcmp(line, "MATLAB_MCP_AUTH_TOKEN") != 0 && strcmp(line, "MATLAB_GATEWAY_EVALUATE_TOKEN") != 0) || !*value) {
      fputs("tcsd-gateway-transport: invalid Gateway credential file\n", stderr); exit(77);
    }
    if (setenv(line, value, 1) != 0) { perror("tcsd-gateway-transport: setenv"); exit(77); }
  }
  fclose(file);
  if (!getenv("MATLAB_MCP_AUTH_TOKEN") || !getenv("MATLAB_GATEWAY_EVALUATE_TOKEN")) {
    fputs("tcsd-gateway-transport: Gateway credentials are incomplete\n", stderr); exit(77);
  }
}

int main(int argc, char **argv) {
  const char *script = argc < 2 ? NULL : controlled_script(argv[1]);
  if (!script) {
    fputs("tcsd-gateway-transport: unsupported controlled script\n", stderr); return 64;
  }
  argv[1] = (char *)script;
  sanitize_python_environment();
  load_secret_file();
  argv[0] = PYTHON_EXECUTABLE;
  execv(argv[0], argv);
  perror("tcsd-gateway-transport: exec");
  return errno == ENOENT ? 127 : 70;
}
