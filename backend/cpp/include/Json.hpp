#pragma once
// ===========================================================================
//  Json.hpp — a very small, dependency-free JSON value / parser / writer.
//
//  The BiteN Go engine is a plain C++20 program that talks to the Node API
//  over stdin/stdout, so it needs to read and write JSON. Pulling in a big
//  third-party library would mean the marker/user has to fetch dependencies
//  before the project compiles, so the ~200 lines needed are implemented here
//  instead. Only what the engine actually uses is supported:
//
//      null · true · false · numbers · strings · arrays · objects
//
//  Objects keep insertion order, which makes the engine's output stable and
//  easy to diff in tests.
// ===========================================================================

#include <cctype>
#include <cmath>
#include <cstdint>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace bng {

class JsonError final : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

class Json;
using JsonArray = std::vector<Json>;
using JsonPair = std::pair<std::string, Json>;

class Json {
 public:
  enum class Type { Null, Bool, Number, String, Array, Object };

  Json() = default;
  Json(std::nullptr_t) {}
  Json(bool value) : type_(Type::Bool), bool_(value) {}
  Json(double value) : type_(Type::Number), number_(value) {}
  Json(int value) : type_(Type::Number), number_(static_cast<double>(value)) {}
  Json(long long value) : type_(Type::Number), number_(static_cast<double>(value)) {}
  Json(const char* value) : type_(Type::String), string_(value) {}
  Json(std::string value) : type_(Type::String), string_(std::move(value)) {}

  static Json array(JsonArray items = {}) {
    Json json;
    json.type_ = Type::Array;
    json.array_ = std::move(items);
    return json;
  }

  static Json object(std::vector<JsonPair> entries = {}) {
    Json json;
    json.type_ = Type::Object;
    json.object_ = std::move(entries);
    return json;
  }

  [[nodiscard]] Type type() const { return type_; }
  [[nodiscard]] bool isNull() const { return type_ == Type::Null; }
  [[nodiscard]] bool isArray() const { return type_ == Type::Array; }
  [[nodiscard]] bool isObject() const { return type_ == Type::Object; }

  // ---- reading -----------------------------------------------------------
  [[nodiscard]] bool asBool(bool fallback = false) const {
    if (type_ == Type::Bool) return bool_;
    if (type_ == Type::Number) return number_ != 0.0;
    return fallback;
  }

  [[nodiscard]] double asNumber(double fallback = 0.0) const {
    if (type_ == Type::Number) return number_;
    if (type_ == Type::String) {
      try {
        return std::stod(string_);
      } catch (...) {
        return fallback;
      }
    }
    return fallback;
  }

  [[nodiscard]] long long asInt(long long fallback = 0) const {
    if (type_ != Type::Number && type_ != Type::String) return fallback;
    return static_cast<long long>(std::llround(asNumber(static_cast<double>(fallback))));
  }

  [[nodiscard]] const std::string& asString() const {
    static const std::string empty;
    return type_ == Type::String ? string_ : empty;
  }

  [[nodiscard]] std::string asString(const std::string& fallback) const { return type_ == Type::String ? string_ : fallback; }

  [[nodiscard]] const JsonArray& items() const {
    static const JsonArray empty;
    return type_ == Type::Array ? array_ : empty;
  }

  [[nodiscard]] const std::vector<JsonPair>& entries() const {
    static const std::vector<JsonPair> empty;
    return type_ == Type::Object ? object_ : empty;
  }

  /** Object member lookup. Returns a null Json when the key is absent. */
  [[nodiscard]] const Json& operator[](const std::string& key) const {
    static const Json nothing;
    if (type_ != Type::Object) return nothing;
    for (const auto& entry : object_)
      if (entry.first == key) return entry.second;
    return nothing;
  }

  [[nodiscard]] bool has(const std::string& key) const { return !(*this)[key].isNull(); }

  // ---- writing -----------------------------------------------------------
  void set(std::string key, Json value) {
    if (type_ != Type::Object) {
      type_ = Type::Object;
      object_.clear();
    }
    for (auto& entry : object_) {
      if (entry.first == key) {
        entry.second = std::move(value);
        return;
      }
    }
    object_.emplace_back(std::move(key), std::move(value));
  }

  void push(Json value) {
    if (type_ != Type::Array) {
      type_ = Type::Array;
      array_.clear();
    }
    array_.push_back(std::move(value));
  }

  [[nodiscard]] std::string dump() const {
    std::ostringstream out;
    write(out);
    return out.str();
  }

  static Json parse(const std::string& text) {
    std::size_t index = 0;
    Json value = parseValue(text, index);
    skipSpace(text, index);
    if (index != text.size()) throw JsonError("Unexpected trailing characters in JSON input.");
    return value;
  }

 private:
  void write(std::ostringstream& out) const {
    switch (type_) {
      case Type::Null: out << "null"; break;
      case Type::Bool: out << (bool_ ? "true" : "false"); break;
      case Type::Number: writeNumber(out); break;
      case Type::String: writeString(out, string_); break;
      case Type::Array: {
        out << '[';
        for (std::size_t i = 0; i < array_.size(); ++i) {
          if (i) out << ',';
          array_[i].write(out);
        }
        out << ']';
        break;
      }
      case Type::Object: {
        out << '{';
        for (std::size_t i = 0; i < object_.size(); ++i) {
          if (i) out << ',';
          writeString(out, object_[i].first);
          out << ':';
          object_[i].second.write(out);
        }
        out << '}';
        break;
      }
    }
  }

  void writeNumber(std::ostringstream& out) const {
    if (!std::isfinite(number_)) {
      out << "null";
      return;
    }
    if (number_ == std::floor(number_) && std::fabs(number_) < 9.0e15) {
      out << static_cast<long long>(number_);
      return;
    }
    std::ostringstream tmp;
    tmp.precision(10);
    tmp << number_;
    out << tmp.str();
  }

  static void writeString(std::ostringstream& out, const std::string& value) {
    out << '"';
    for (const unsigned char character : value) {
      switch (character) {
        case '"': out << "\\\""; break;
        case '\\': out << "\\\\"; break;
        case '\b': out << "\\b"; break;
        case '\f': out << "\\f"; break;
        case '\n': out << "\\n"; break;
        case '\r': out << "\\r"; break;
        case '\t': out << "\\t"; break;
        default:
          if (character < 0x20) {
            char buffer[7];
            std::snprintf(buffer, sizeof buffer, "\\u%04x", character);
            out << buffer;
          } else {
            out << static_cast<char>(character);
          }
      }
    }
    out << '"';
  }

  static void skipSpace(const std::string& text, std::size_t& index) {
    while (index < text.size() && std::isspace(static_cast<unsigned char>(text[index]))) ++index;
  }

  static Json parseValue(const std::string& text, std::size_t& index) {
    skipSpace(text, index);
    if (index >= text.size()) throw JsonError("Unexpected end of JSON input.");
    const char character = text[index];
    if (character == '{') return parseObject(text, index);
    if (character == '[') return parseArray(text, index);
    if (character == '"') return Json(parseString(text, index));
    if (text.compare(index, 4, "true") == 0) { index += 4; return Json(true); }
    if (text.compare(index, 5, "false") == 0) { index += 5; return Json(false); }
    if (text.compare(index, 4, "null") == 0) { index += 4; return Json(); }
    return parseNumber(text, index);
  }

  static Json parseObject(const std::string& text, std::size_t& index) {
    Json result = Json::object();
    ++index;  // consume '{'
    skipSpace(text, index);
    if (index < text.size() && text[index] == '}') { ++index; return result; }
    while (true) {
      skipSpace(text, index);
      if (index >= text.size() || text[index] != '"') throw JsonError("Expected an object key.");
      std::string key = parseString(text, index);
      skipSpace(text, index);
      if (index >= text.size() || text[index] != ':') throw JsonError("Expected ':' after an object key.");
      ++index;
      result.set(std::move(key), parseValue(text, index));
      skipSpace(text, index);
      if (index >= text.size()) throw JsonError("Unterminated object.");
      if (text[index] == ',') { ++index; continue; }
      if (text[index] == '}') { ++index; return result; }
      throw JsonError("Expected ',' or '}' in object.");
    }
  }

  static Json parseArray(const std::string& text, std::size_t& index) {
    Json result = Json::array();
    ++index;  // consume '['
    skipSpace(text, index);
    if (index < text.size() && text[index] == ']') { ++index; return result; }
    while (true) {
      result.push(parseValue(text, index));
      skipSpace(text, index);
      if (index >= text.size()) throw JsonError("Unterminated array.");
      if (text[index] == ',') { ++index; continue; }
      if (text[index] == ']') { ++index; return result; }
      throw JsonError("Expected ',' or ']' in array.");
    }
  }

  static std::string parseString(const std::string& text, std::size_t& index) {
    ++index;  // consume opening quote
    std::string value;
    while (index < text.size()) {
      const char character = text[index++];
      if (character == '"') return value;
      if (character != '\\') { value.push_back(character); continue; }
      if (index >= text.size()) break;
      const char escaped = text[index++];
      switch (escaped) {
        case '"': value.push_back('"'); break;
        case '\\': value.push_back('\\'); break;
        case '/': value.push_back('/'); break;
        case 'b': value.push_back('\b'); break;
        case 'f': value.push_back('\f'); break;
        case 'n': value.push_back('\n'); break;
        case 'r': value.push_back('\r'); break;
        case 't': value.push_back('\t'); break;
        case 'u': {
          if (index + 4 > text.size()) throw JsonError("Truncated \\u escape.");
          const int code = std::stoi(text.substr(index, 4), nullptr, 16);
          index += 4;
          appendUtf8(value, code);
          break;
        }
        default: throw JsonError("Unsupported escape sequence in string.");
      }
    }
    throw JsonError("Unterminated string.");
  }

  static void appendUtf8(std::string& out, int code) {
    if (code < 0x80) {
      out.push_back(static_cast<char>(code));
    } else if (code < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (code >> 6)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xE0 | (code >> 12)));
      out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    }
  }

  static Json parseNumber(const std::string& text, std::size_t& index) {
    const std::size_t start = index;
    if (index < text.size() && (text[index] == '-' || text[index] == '+')) ++index;
    while (index < text.size() && (std::isdigit(static_cast<unsigned char>(text[index])) || text[index] == '.' || text[index] == 'e' || text[index] == 'E' || text[index] == '-' || text[index] == '+')) ++index;
    if (start == index) throw JsonError("Expected a JSON value.");
    try {
      return Json(std::stod(text.substr(start, index - start)));
    } catch (...) {
      throw JsonError("Malformed number.");
    }
  }

  Type type_{Type::Null};
  bool bool_{false};
  double number_{0.0};
  std::string string_;
  JsonArray array_;
  std::vector<JsonPair> object_;
};

}  // namespace bng
