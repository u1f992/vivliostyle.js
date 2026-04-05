#include <array>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <lcms2.h>
#include <vector>

using namespace emscripten;

// Opaque handle wrappers
// lcms2 uses void* handles (cmsHPROFILE, cmsHTRANSFORM).
// We wrap them in classes so embind can track ownership and provide .delete().

class Profile {
  cmsHPROFILE h_;

public:
  explicit Profile(cmsHPROFILE h) : h_(h) {}
  ~Profile() {
    if (h_) {
      cmsCloseProfile(h_);
    }
  }

  [[nodiscard]] auto handle() const -> cmsHPROFILE { return h_; }

  [[nodiscard]] auto colorSpace() const -> unsigned int {
    return static_cast<unsigned int>(cmsGetColorSpace(h_));
  }

  [[nodiscard]] auto pcs() const -> unsigned int {
    return static_cast<unsigned int>(cmsGetPCS(h_));
  }

  [[nodiscard]] auto headerRenderingIntent() const -> cmsUInt32Number {
    return cmsGetHeaderRenderingIntent(h_);
  }

  [[nodiscard]] auto infoASCII(unsigned int info) const -> std::string {
    std::array<char, 256> buf{};
    cmsUInt32Number len = cmsGetProfileInfoASCII(
        h_, static_cast<cmsInfoType>(info), "en", "US", buf.data(), buf.size());
    if (len == 0) {
      return "";
    }
    return {buf.data(), len - 1}; // exclude null terminator
  }
};

class Transform {
  cmsHTRANSFORM h_;
  cmsUInt32Number inputChannels_;
  cmsUInt32Number outputChannels_;

public:
  // NOLINTNEXTLINE(bugprone-easily-swappable-parameters)
  Transform(cmsHTRANSFORM h, cmsUInt32Number inCh, cmsUInt32Number outCh)
      : h_(h), inputChannels_(inCh), outputChannels_(outCh) {}
  ~Transform() {
    if (h_) {
      cmsDeleteTransform(h_);
    }
  }

  [[nodiscard]] auto handle() const -> cmsHTRANSFORM { return h_; }
  [[nodiscard]] auto inputChannels() const -> cmsUInt32Number {
    return inputChannels_;
  }
  [[nodiscard]] auto outputChannels() const -> cmsUInt32Number {
    return outputChannels_;
  }

  [[nodiscard]] auto doTransform(const val &inputArr) const -> val {
    std::vector<double> input = vecFromJSArray<double>(inputArr);
    std::vector<double> output(outputChannels_);
    cmsDoTransform(h_, input.data(), output.data(), 1);
    val result = val::array();
    for (const auto &v : output) {
      result.call<void>("push", v);
    }
    return result;
  }
};

// Profile factory functions

auto createSRGBProfile() -> Profile * {
  return new Profile(cmsCreate_sRGBProfile());
}

auto createXYZProfile() -> Profile * {
  return new Profile(cmsCreateXYZProfile());
}

auto createLab4Profile() -> Profile * {
  return new Profile(cmsCreateLab4Profile(nullptr));
}

auto createOkLabProfile() -> Profile * {
  return new Profile(cmsCreate_OkLabProfile(nullptr));
}

auto openProfileFromMemory(const val &data) -> Profile * {
  std::vector<unsigned char> buf = vecFromJSArray<unsigned char>(data);
  cmsHPROFILE h = cmsOpenProfileFromMem(buf.data(), buf.size());
  if (!h) {
    return nullptr;
  }
  return new Profile(h);
}

// Transform factory

static auto channelsOf(cmsUInt32Number format) -> cmsUInt32Number {
  return T_CHANNELS(format);
}

auto createTransform(Profile &input, cmsUInt32Number inputFormat,
                     Profile &output, cmsUInt32Number outputFormat,
                     cmsUInt32Number intent, cmsUInt32Number flags)
    -> Transform * {
  cmsHTRANSFORM h =
      cmsCreateTransform(input.handle(), inputFormat, output.handle(),
                         outputFormat, intent, flags);
  if (!h) {
    return nullptr;
  }
  return new Transform(h, channelsOf(inputFormat), channelsOf(outputFormat));
}

EMSCRIPTEN_BINDINGS(lcms) {
  // Profile class
  class_<Profile>("Profile")
      .function("colorSpace", &Profile::colorSpace)
      .function("pcs", &Profile::pcs)
      .function("headerRenderingIntent", &Profile::headerRenderingIntent)
      .function("infoASCII", &Profile::infoASCII);

  // Transform class
  class_<Transform>("Transform")
      .function("inputChannels", &Transform::inputChannels)
      .function("outputChannels", &Transform::outputChannels)
      .function("doTransform", &Transform::doTransform);

  // Factory functions
  function("createSRGBProfile", &createSRGBProfile, allow_raw_pointers());
  function("createXYZProfile", &createXYZProfile, allow_raw_pointers());
  function("createLab4Profile", &createLab4Profile, allow_raw_pointers());
  function("createOkLabProfile", &createOkLabProfile, allow_raw_pointers());
  function("openProfileFromMemory", &openProfileFromMemory,
           allow_raw_pointers());
  function("createTransform", &createTransform, allow_raw_pointers());

  // Pixel format constants (double-precision float variants)
  constant("TYPE_RGB_DBL", static_cast<unsigned int>(TYPE_RGB_DBL));
  constant("TYPE_CMYK_DBL", static_cast<unsigned int>(TYPE_CMYK_DBL));
  constant("TYPE_Lab_DBL", static_cast<unsigned int>(TYPE_Lab_DBL));
  constant("TYPE_XYZ_DBL", static_cast<unsigned int>(TYPE_XYZ_DBL));
  constant("TYPE_GRAY_DBL", static_cast<unsigned int>(TYPE_GRAY_DBL));
  constant("TYPE_OKLAB_DBL", static_cast<unsigned int>(TYPE_OKLAB_DBL));

  // Rendering intents
  constant("INTENT_PERCEPTUAL", static_cast<unsigned int>(INTENT_PERCEPTUAL));
  constant("INTENT_RELATIVE_COLORIMETRIC",
           static_cast<unsigned int>(INTENT_RELATIVE_COLORIMETRIC));
  constant("INTENT_SATURATION", static_cast<unsigned int>(INTENT_SATURATION));
  constant("INTENT_ABSOLUTE_COLORIMETRIC",
           static_cast<unsigned int>(INTENT_ABSOLUTE_COLORIMETRIC));

  // Transform flags
  constant("cmsFLAGS_NOCACHE", static_cast<unsigned int>(cmsFLAGS_NOCACHE));
  constant("cmsFLAGS_NOOPTIMIZE",
           static_cast<unsigned int>(cmsFLAGS_NOOPTIMIZE));
  constant("cmsFLAGS_BLACKPOINTCOMPENSATION",
           static_cast<unsigned int>(cmsFLAGS_BLACKPOINTCOMPENSATION));
  constant("cmsFLAGS_SOFTPROOFING",
           static_cast<unsigned int>(cmsFLAGS_SOFTPROOFING));
  constant("cmsFLAGS_GAMUTCHECK",
           static_cast<unsigned int>(cmsFLAGS_GAMUTCHECK));

  // Info types
  constant("cmsInfoDescription", static_cast<unsigned int>(cmsInfoDescription));
  constant("cmsInfoManufacturer",
           static_cast<unsigned int>(cmsInfoManufacturer));
  constant("cmsInfoModel", static_cast<unsigned int>(cmsInfoModel));
  constant("cmsInfoCopyright", static_cast<unsigned int>(cmsInfoCopyright));

  // Color space signatures
  constant("cmsSigRgbData", static_cast<unsigned int>(cmsSigRgbData));
  constant("cmsSigCmykData", static_cast<unsigned int>(cmsSigCmykData));
  constant("cmsSigLabData", static_cast<unsigned int>(cmsSigLabData));
  constant("cmsSigXYZData", static_cast<unsigned int>(cmsSigXYZData));
  constant("cmsSigGrayData", static_cast<unsigned int>(cmsSigGrayData));
}
