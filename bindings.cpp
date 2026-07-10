// Emscripten binding for Tunepal's transcriber.
// Compiles the portable DSP core (no Android/JNI) to WebAssembly so the browser
// can turn ~12s of audio into the pitch-letter query string the search expects.
//
// Contract (from tunepalconstants.h): feed exactly SAMPLE_RATE * SAMPLE_TIME
// mono float samples (22050 * 12 = 264600) at 22050 Hz.

#include "transcriber.h"
#include "tunepalconstants.h"
#include <emscripten.h>
#include <string>

static std::string g_result;

extern "C" {

// Number of float samples the transcriber expects (allocate this in JS).
EMSCRIPTEN_KEEPALIVE
int tp_num_samples() { return (int)(SAMPLE_RATE * SAMPLE_TIME); }

// samples: pointer to tp_num_samples() floats (mono, 22050 Hz).
// Returns a pointer to a null-terminated pitch-letter string (e.g. "ABCADGEC...").
EMSCRIPTEN_KEEPALIVE
const char* tp_transcribe(float* samples) {
    float progress = 0.0f;
    bool interrupted = false;
    Transcriber t;
    t.setSignal(samples);
    g_result = t.transcribe(&progress, &interrupted, false); // midi=false -> query string
    return g_result.c_str();
}

}
