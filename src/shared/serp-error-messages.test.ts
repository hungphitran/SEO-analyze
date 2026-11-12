import { describe, expect, it } from "vitest";
import { localizeSerpMessage } from "./serp-error-messages";

describe("localizeSerpMessage", () => {
  it.each([
    [
      "SerpApi monthly search limit reached; no rank was recorded.",
      /SerpApi.*trong tháng/,
    ],
    ["SerpApi hourly search limit reached; no rank was recorded.", /trong giờ/],
    [
      "SerpApi daily keyword limit reached; no rank was recorded.",
      /trong ngày/,
    ],
    [
      "OpenSERP daily project request limit reached; no rank was recorded.",
      /OpenSERP.*trong ngày/,
    ],
    ["SerpApi plan search limit reached; no rank was recorded.", /trong tháng/],
    [
      "SerpApi rate-limited the request (hourly throughput); no rank was recorded.",
      /giới hạn tốc độ/,
    ],
    ["SerpApi rejected the API key; no rank was recorded.", /từ chối khóa API/],
    ["SerpApi is not configured. Set SERPAPI_API_KEY.", /chưa được cấu hình/],
    [
      "SERPAPI_MAX_KEYWORDS_PER_DAY must be an integer from 1 to 250.",
      /chưa được cấu hình/,
    ],
    ["SerpApi request timed out; no rank was recorded.", /phản hồi quá lâu/],
    [
      "SerpApi could not be reached; no rank was recorded.",
      /tạm thời không khả dụng/,
    ],
    [
      "SerpApi connection dropped; no rank was recorded.",
      /tạm thời không khả dụng/,
    ],
    [
      "SerpApi returned no organic results; the rank was not changed.",
      /không trả về kết quả/,
    ],
    [
      "SerpApi returned an unexpected response; no rank was recorded.",
      /dữ liệu không hợp lệ/,
    ],
    ["OpenSERP was challenged by a CAPTCHA; no rank was recorded.", /CAPTCHA/],
    ["Keyword is empty.", /Từ khóa trống/],
    ["Keyword is longer than 300 characters.", /quá dài/],
    ["Tracked domain is invalid; no rank was recorded.", /Tên miền/],
    ["Invalid country code for SerpApi.", /quốc gia\/ngôn ngữ/],
    [
      "SerpApi rank tracking supports a country/language market, not city-level targeting.",
      /quốc gia\/ngôn ngữ/,
    ],
    [
      "SerpApi rank check failed; no rank was recorded.",
      /tạm thời không khả dụng/,
    ],
  ])("translates %j", (message, expected) => {
    expect(localizeSerpMessage(message)).toMatch(expected);
  });

  it("leaves unknown text alone and never invents text for it", () => {
    expect(localizeSerpMessage("Something else entirely")).toBeNull();
  });
});
