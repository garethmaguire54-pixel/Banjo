#!/usr/bin/env bash
set -e
# Build the Tunepal transcriber to WebAssembly.
#
# Prereq: the Emscripten SDK (emsdk) installed and activated:
#   git clone https://github.com/emscripten-core/emsdk && cd emsdk
#   ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
#
# Copy the portable DSP sources here from the Android repo:
#   app/src/main/cpp/{transcriber,FFT,PitchDetector,FuzzyHistogram,pitchspeller,utils}.cpp
#   app/src/main/cpp/*.h  and  tunepalconstants.h
# Do NOT include tunepal.cpp (Android/JNI glue) or main.cpp (stub) or abc2midi/*.

SRC="transcriber.cpp FFT.cpp PitchDetector.cpp FuzzyHistogram.cpp pitchspeller.cpp utils.cpp bindings.cpp"

emcc $SRC -I . -O3 \
  -s MODULARIZE=1 -s EXPORT_NAME=TunepalWasm \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_tp_transcribe","_tp_num_samples","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","HEAPF32"]' \
  -o transcriber.js

echo "Built transcriber.js + transcriber.wasm"
