FROM emscripten/emsdk:5.0.5
RUN apt-get update \
    && apt-get install --yes --no-install-recommends wget gnupg software-properties-common \
    && wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add - \
    && add-apt-repository "deb https://apt.llvm.org/noble/ llvm-toolchain-noble main" \
    && apt-get update \
    && apt-get install --yes --no-install-recommends clang-format-23 clang-tidy-23 \
    && ln -sf /usr/bin/clang-format-23 /usr/bin/clang-format \
    && ln -sf /usr/bin/clang-tidy-23 /usr/bin/clang-tidy \
    && rm -rf /var/lib/apt/lists/*
