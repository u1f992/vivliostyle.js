LCMS_DIR := Little-CMS
LIB_DIR := lib
OBJ_DIR := .obj

LCMS_SRCS := $(wildcard $(LCMS_DIR)/src/*.c)
LCMS_OBJS := $(patsubst $(LCMS_DIR)/src/%.c,$(OBJ_DIR)/%.o,$(LCMS_SRCS))

CFLAGS := -O3 -I$(LCMS_DIR)/include
LDFLAGS := -O3 -lembind \
	-s MODULARIZE=1 \
	-s EXPORT_ES6=1 \
	-s EXPORT_NAME=createLcmsModule \
	-s ENVIRONMENT=web,worker,node \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s FILESYSTEM=0 \
	-s DISABLE_EXCEPTION_CATCHING=1 \
	--emit-tsd lcms.d.ts

SYSROOT := /emsdk/upstream/emscripten/cache/sysroot/include
TIDY_FLAGS := --checks='clang-analyzer-*,bugprone-*,modernize-*,performance-*' \
	--header-filter='src/.*'
TIDY_COMPILE_FLAGS := -I$(LCMS_DIR)/include \
	-isystem $(SYSROOT)/c++/v1 \
	-isystem $(SYSROOT) \
	-isystem $(SYSROOT)/compat \
	--target=wasm32-unknown-emscripten

.PHONY: all clean format lint

all: $(LIB_DIR)/lcms.js

$(OBJ_DIR)/%.o: $(LCMS_DIR)/src/%.c | $(OBJ_DIR)
	emcc $(CFLAGS) -c -o $@ $<

$(LIB_DIR)/lcms.js: src/bindings.cpp $(LCMS_OBJS) | $(LIB_DIR)
	em++ $(CFLAGS) $(LDFLAGS) -o $@ $^

$(OBJ_DIR) $(LIB_DIR):
	mkdir -p $@

format:
	clang-format -i src/bindings.cpp

lint:
	clang-tidy $(TIDY_FLAGS) src/bindings.cpp -- $(TIDY_COMPILE_FLAGS)

clean:
	rm -rf $(OBJ_DIR) $(LIB_DIR)
