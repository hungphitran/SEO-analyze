import { getIssueDescriptor, type AuditIssueType } from "@/shared/audit-issues";

type IssueCopy = { title: string; explanation: string; howToFix: string };

/**
 * Client-only Vietnamese labels for audit issue types.
 * Schema/MCP identifiers stay on the English registry in `@/shared/audit-issues`.
 */
const ISSUE_COPY = {
  "blocked-page": {
    title: "Trình thu thập bị chặn",
    explanation:
      "Trang trả về thử thách bot hoặc từ chối truy cập (ví dụ thử thách Cloudflare hoặc mã 403) thay vì nội dung. Chúng tôi báo cáo đúng thực tế — nhưng trang này không được kiểm tra, và các trình thu thập khác như công cụ tìm kiếm cũng có thể gặp trở ngại tương tự.",
    howToFix:
      'Nếu bạn sở hữu trang này, hãy cho phép user-agent "OpenSEO-Audit" trong thiết lập WAF/chống bot (trên Cloudflare: quy tắc WAF bỏ qua bảo vệ bot khi user-agent chứa "OpenSEO-Audit"). Sau đó chạy lại bản kiểm tra. Trên Shopify, dùng quyền truy cập trình thu thập (Online Store → Preferences → Crawler access) rồi dán chữ ký vào OpenSEO ở Cài đặt → Quyền truy cập trình thu thập. Cách cho phép và xác minh: https://openseo.so/docs/crawler',
  },
  "javascript-rendering-suspected": {
    title: "Nội dung có thể cần JavaScript",
    explanation:
      "HTML của trang chứa khung ứng dụng JavaScript với rất ít nội dung đọc được và không có tiêu đề, liên kết hoặc hình ảnh. Trang có thể tải nội dung trong trình duyệt, hoặc vẫn đang tải khi được kết xuất. Các kiểm tra nội dung đã được bỏ qua vì HTML này có thể chưa phản ánh trang đầy đủ.",
    howToFix:
      'Nếu bản kiểm tra này chưa kết xuất JavaScript, hãy chạy bản mới với tùy chọn "Kết xuất JavaScript" để kiểm tra nội dung đã tải. Để thu thập đáng tin cậy, hãy đưa nội dung và điều hướng quan trọng vào HTML ban đầu bằng kết xuất phía máy chủ hoặc prerender. Cảnh báo này không chứng minh công cụ tìm kiếm không thể lập chỉ mục trang.',
  },
  "rate-limited-page": {
    title: "Bị giới hạn tần suất (429)",
    explanation:
      "Máy chủ trả về 429 Too Many Requests, nên trang này không được kiểm tra. Trình thu thập đã tạm dừng theo Retry-After rồi thử lại một lần trước khi chuyển sang trang khác.",
    howToFix:
      'Hãy tăng hạn mức cho trình thu thập, hoặc cho phép user-agent "OpenSEO-Audit" trong quy tắc giới hạn tần suất. Sau đó chạy lại bản kiểm tra. Chạy với ít trang hơn cũng giúp nếu hạn mức chặt. Trên Shopify, dùng Crawler access rồi dán chữ ký vào OpenSEO ở Cài đặt → Quyền truy cập trình thu thập. https://openseo.so/docs/crawler',
  },
  "crawl-rate-limited": {
    title: "Dừng thu thập sớm: giới hạn tần suất",
    explanation:
      "Trang từ chối nhiều URL liên tiếp với 429, hoặc để trình thu thập chờ quá lâu, nên chúng tôi đã dừng. Báo cáo này chưa đầy đủ; các URL chưa tải không được ghi là hỏng hoặc bị giới hạn.",
    howToFix:
      "Chạy lại bản kiểm tra sau khi hạn mức được đặt lại, hoặc nhờ chủ trang cho phép trình thu thập OpenSEO-Audit (https://openseo.so/docs/crawler). Trên Shopify, dùng Crawler access rồi dán chữ ký vào OpenSEO ở Cài đặt → Quyền truy cập trình thu thập.",
  },
  "crawl-time-limit": {
    title: "Dừng thu thập sớm: hết thời gian",
    explanation:
      "Các bản kiểm tra có kết xuất JavaScript dừng sau giới hạn thời gian, và bản này đã đạt giới hạn đó. Báo cáo chưa đầy đủ; các URL chưa tải không được ghi là hỏng.",
    howToFix:
      "Chạy lại với giới hạn trang thấp hơn, hoặc tắt Kết xuất JavaScript nếu nội dung và liên kết đã có trong HTML. Việc kết xuất chỉ tính phí cho các trang thực sự được kết xuất.",
  },
  "crawl-credits-exhausted": {
    title: "Dừng thu thập sớm: đạt giới hạn chi phí",
    explanation:
      "Nhiều trang trên site cần bộ kết xuất nâng cao, nên bản kiểm tra đã đạt giới hạn chi phí và dừng. Bạn chỉ bị tính phí cho các trang đã được kết xuất.",
    howToFix:
      "Nếu trang không cần JavaScript để hiện nội dung, hãy chạy lại với Kết xuất JavaScript tắt.",
  },
  "server-error": {
    title: "Lỗi máy chủ (5xx)",
    explanation:
      "Trang trả về lỗi máy chủ 5xx. Nếu công cụ tìm kiếm liên tục thấy lỗi này, chúng sẽ thu thập ít hơn và có thể gỡ trang khỏi chỉ mục.",
    howToFix:
      "Kiểm tra nhật ký máy chủ cho URL này và sửa lỗi gốc. Nếu trang không còn, hãy trả về 404/410 hoặc chuyển hướng tới trang phù hợp thay vì để lỗi.",
  },
  "broken-internal-link": {
    title: "Liên kết nội bộ bị hỏng",
    explanation:
      "Trang này trỏ tới một URL nội bộ trả về lỗi (4xx/5xx). Liên kết hỏng lãng phí ngân sách thu thập, làm mất sức mạnh liên kết và gây khó chịu cho người dùng.",
    howToFix:
      "Sửa liên kết tới URL đúng đang hoạt động, hoặc gỡ liên kết. Nếu đích đã chuyển, nên liên kết thẳng tới URL mới thay vì dựa vào chuyển hướng.",
  },
  "missing-title": {
    title: "Thiếu thẻ tiêu đề",
    explanation:
      "Trang không có <title>. Tiêu đề là tín hiệu liên quan trên trang mạnh nhất và là dòng tiêu đề trên kết quả tìm kiếm; nếu thiếu, công cụ tìm kiếm sẽ tự tạo một tiêu đề, thường kém hơn.",
    howToFix:
      "Thêm <title> riêng, mô tả rõ, khoảng 50–60 ký tự, nêu chủ đề chính của trang.",
  },
  "broken-page": {
    title: "Trang trả về lỗi (4xx)",
    explanation:
      "URL được thu thập trả về lỗi phía máy khách (ví dụ 404). Nếu sitemap hoặc trang khác vẫn trỏ tới đây, trình thu thập sẽ tiếp tục lãng phí yêu cầu.",
    howToFix:
      "Nếu trang cần tồn tại, hãy khôi phục. Nếu đã gỡ cố ý, hãy xóa khỏi sitemap và liên kết nội bộ, và cân nhắc chuyển hướng 301 tới trang gần nhất còn sống.",
  },
  "duplicate-title": {
    title: "Tiêu đề trùng lặp",
    explanation:
      "Nhiều trang dùng cùng một thẻ tiêu đề. Công cụ tìm kiếm dùng tiêu đề để phân biệt trang; tiêu đề trùng khiến các trang cạnh tranh lẫn nhau và làm giảm tỷ lệ nhấp.",
    howToFix:
      "Viết tiêu đề riêng cho từng trang, mô tả đúng nội dung. Với trang theo mẫu, hãy đưa thuộc tính phân biệt (tên, danh mục, địa điểm) vào mẫu.",
  },
  "duplicate-meta-description": {
    title: "Meta description trùng lặp",
    explanation:
      "Nhiều trang dùng cùng một meta description, nên kết quả tìm kiếm hiện đoạn mô tả giống nhau và người dùng không phân biệt được các trang.",
    howToFix:
      "Viết meta description riêng cho từng trang, hoặc gỡ bản trùng — công cụ tìm kiếm sẽ tạo đoạn trích từ nội dung, tốt hơn một bản trùng sai.",
  },
  "duplicate-content": {
    title: "Nội dung trang trùng lặp",
    explanation:
      "Hai hoặc nhiều URL phục vụ cùng một văn bản hiển thị. Công cụ tìm kiếm sẽ chọn một phiên bản để lập chỉ mục và bỏ qua các bản còn lại, đồng thời tín hiệu xếp hạng bị chia nhỏ.",
    howToFix:
      "Gộp các bản trùng: chọn URL chuẩn, thêm rel=canonical từ các bản còn lại, và chuyển hướng 301 khi có thể (thường gặp: dấu gạch cuối URL, tham số, http/https hoặc www).",
  },
  "missing-meta-description": {
    title: "Thiếu meta description",
    explanation:
      "Trang không có meta description. Công cụ tìm kiếm sẽ ghép đoạn mô tả từ nội dung, thường kém hấp dẫn hơn và có thể làm giảm tỷ lệ nhấp.",
    howToFix:
      "Thêm meta description khoảng 70–160 ký tự, tóm tắt trang và nêu lý do để nhấp.",
  },
  "missing-h1": {
    title: "Thiếu tiêu đề H1",
    explanation:
      "Trang không có H1. H1 cho người dùng và công cụ tìm kiếm biết trang nói về gì; thiếu H1 thường làm chủ đề kém rõ ràng.",
    howToFix:
      "Thêm một H1 nêu chủ đề chính của trang, thống nhất với thẻ tiêu đề.",
  },
  "multiple-h1": {
    title: "Nhiều tiêu đề H1",
    explanation:
      "Trang có hơn một H1, làm loãng tín hiệu chủ đề và thường do lỗi mẫu (ví dụ logo và tiêu đề đều được đánh dấu H1).",
    howToFix:
      "Giữ một H1 cho tiêu đề chính và hạ các tiêu đề còn lại xuống H2/H3 (hoặc phần tử không phải tiêu đề với logo).",
  },
  "redirect-chain": {
    title: "Chuỗi chuyển hướng",
    explanation:
      "Cần hai hoặc nhiều lần chuyển hướng liên tiếp mới tới trang cuối. Mỗi bước tăng độ trễ, làm mất sức mạnh liên kết và tốn ngân sách thu thập.",
    howToFix:
      "Hãy trỏ URL đầu tiên (và mọi liên kết nội bộ) thẳng tới đích cuối, sao cho có tối đa một lần chuyển hướng.",
  },
  "redirect-loop": {
    title: "Vòng lặp chuyển hướng",
    explanation:
      "Chuỗi chuyển hướng quay lại chính nó, nên URL không bao giờ mở được. Trình duyệt và trình thu thập sẽ dừng với lỗi.",
    howToFix:
      "Rà quy tắc chuyển hướng của URL này và phá vòng lặp để chuỗi kết thúc ở một trang 200 thật.",
  },
  "canonical-conflict": {
    title: "Tín hiệu canonical mâu thuẫn",
    explanation:
      "Trang khai báo các URL chuẩn khác nhau trong HTML <link rel=canonical> và HTTP Link header. Khi tín hiệu mâu thuẫn, công cụ tìm kiếm có thể bỏ cả hai và tự chọn URL chuẩn.",
    howToFix:
      "Chọn một URL chuẩn và chỉ khai báo ở một nơi (thường là phần head của HTML); gỡ hoặc thống nhất khai báo còn lại.",
  },
  "thin-content": {
    title: "Nội dung quá mỏng",
    explanation:
      "Trang có rất ít văn bản hiển thị. Trang mỏng ít khi xếp hạng tốt, có thể ảnh hưởng đánh giá chất lượng toàn site, và (nếu site kết xuất phía máy khách) có thể nghĩa là nội dung không hiện với trình thu thập HTML thuần.",
    howToFix:
      "Hãy bổ sung nội dung thực sự hữu ích, gắn noindex, hoặc gộp vào một trang mạnh hơn. Nếu nội dung có nhưng do JavaScript tạo ra, hãy kết xuất phía máy chủ hoặc prerender.",
  },
  "images-missing-alt": {
    title: "Hình ảnh thiếu mô tả alt",
    explanation:
      "Một hoặc nhiều hình trên trang thiếu thuộc tính alt. Văn bản alt là yêu cầu về hỗ trợ tiếp cận và là cách chính để công cụ tìm kiếm hiểu hình ảnh.",
    howToFix:
      'Thêm mô tả alt cho hình có ý nghĩa; chỉ dùng alt rỗng (alt="") với hình trang trí thuần túy.',
  },
  "orphan-page": {
    title: "Trang mồ côi",
    explanation:
      "Không có trang đã thu thập nào liên kết tới URL này — nó chỉ được tìm thấy qua sitemap. Trang không có liên kết nội bộ ít được thu thập, không nhận sức mạnh liên kết nội bộ, và người dùng khó tìm khi duyệt site.",
    howToFix:
      "Hãy liên kết tới trang này từ các trang liên quan (điều hướng, nội dung liên quan, trang trung tâm), hoặc gỡ khỏi sitemap nếu không nên được lập chỉ mục.",
  },
  "no-outgoing-links": {
    title: "Trang không có liên kết đi",
    explanation:
      "Trang không có liên kết nào — là ngõ cụt. Sức mạnh liên kết đi vào sẽ dừng lại, trình thu thập không có đường đi tiếp, và người dùng phải bấm nút quay lại.",
    howToFix:
      "Thêm liên kết tới trang liên quan, danh mục cha, hoặc trang chủ. Nếu điều hướng được JavaScript tạo ra, hãy bảo đảm chúng cũng có trong HTML kết xuất phía máy chủ.",
  },
  "title-too-long": {
    title: "Tiêu đề quá dài",
    explanation:
      "Tiêu đề vượt khoảng 60 ký tự, nên kết quả tìm kiếm sẽ cắt ngắn và phần cuối có thể bị mất giữa chừng.",
    howToFix:
      "Rút tiêu đề còn khoảng 50–60 ký tự, đưa những từ quan trọng nhất lên đầu.",
  },
  "title-too-short": {
    title: "Tiêu đề quá ngắn",
    explanation:
      "Tiêu đề dưới khoảng 10 ký tự, thường quá chung chung để mô tả trang hoặc thu hút lượt nhấp.",
    howToFix:
      "Mở rộng tiêu đề thành cụm mô tả (khoảng 30–60 ký tự) nêu rõ trang mang lại gì.",
  },
  "meta-description-too-long": {
    title: "Meta description quá dài",
    explanation:
      "Meta description vượt khoảng 160 ký tự, nên công cụ tìm kiếm sẽ cắt đoạn mô tả.",
    howToFix:
      "Rút còn khoảng 70–160 ký tự, vẫn giữ thông điệp chính và lời kêu gọi hành động.",
  },
  "meta-description-too-short": {
    title: "Meta description quá ngắn",
    explanation:
      "Meta description dưới khoảng 70 ký tự. Mô tả ngắn lãng phí khoảng trống đoạn trích trên kết quả tìm kiếm, và công cụ tìm kiếm thường bỏ qua để lấy văn bản từ trang.",
    howToFix:
      "Mở rộng mô tả còn khoảng 70–160 ký tự, tóm tắt trang và nêu lý do để nhấp.",
  },
  "heading-order-skip": {
    title: "Bỏ cấp tiêu đề",
    explanation:
      "Cấu trúc tiêu đề bỏ cấp (ví dụ H4 ngay sau H2). Điều này làm yếu cấu trúc tài liệu đối với công cụ hỗ trợ tiếp cận và phân tích nội dung.",
    howToFix:
      "Điều chỉnh cấp tiêu đề để giảm lần lượt từng bước (H1 → H2 → H3), không bỏ cấp.",
  },
  "slow-response": {
    title: "Máy chủ phản hồi chậm",
    explanation:
      "Phản hồi HTML mất hơn 1,5 giây. Thời gian tới byte đầu chậm kéo theo mọi chỉ số hiệu suất phía sau và làm giảm tốc độ thu thập trên site lớn.",
    howToFix:
      "Kiểm tra thời gian máy chủ/cơ sở dữ liệu và bộ nhớ đệm của tuyến này; phục vụ HTML đã lưu đệm hoặc tạo tĩnh thường khắc phục được.",
  },
  "noindex-page": {
    title: "Trang đang noindex",
    explanation:
      "Trang yêu cầu công cụ tìm kiếm không lập chỉ mục (qua thẻ robots hoặc header X-Robots-Tag). Điều này thường là chủ đích — đây là nhắc nhở, không phải lỗi.",
    howToFix:
      "Nếu trang này cần xếp hạng, hãy gỡ chỉ thị noindex. Nếu là chủ đích (trang quản trị, cảm ơn, bộ lọc), không cần làm gì.",
  },
  "canonicalized-page": {
    title: "Đã chỉ định canonical tới URL khác",
    explanation:
      "Trang khai báo một URL khác làm URL chuẩn, bảo công cụ tìm kiếm lập chỉ mục URL đó thay thế. Ổn nếu là chủ đích (trang tham số, syndication) — thành vấn đề nếu trang này vốn cần xếp hạng.",
    howToFix:
      "Nếu trang này cần tự xếp hạng, hãy đặt canonical về chính nó. Nếu không, không cần làm gì.",
  },
  "deep-page": {
    title: "Trang nằm sâu trong cấu trúc site",
    explanation:
      "Trang cách trang chủ từ 5 lần nhấp trở lên. Trang sâu được thu thập ít hơn và nhận ít sức mạnh liên kết hơn.",
    howToFix:
      "Thêm liên kết từ các trang cấp cao hơn (trang trung tâm, danh mục, điều hướng) để rút ngắn đường tới trang này.",
  },
  "missing-open-graph": {
    title: "Thẻ Open Graph chưa đầy đủ",
    explanation:
      "Trang thiếu một hoặc nhiều thẻ og:title, og:description, og:image. Mạng xã hội và ứng dụng chat dùng các thẻ này để dựng bản xem trước liên kết, nên liên kết được chia sẻ có thể trông trống trơn hoặc lấy ảnh ngẫu nhiên.",
    howToFix:
      "Thêm og:title, og:description và og:image (tối thiểu 1200x630 px) vào phần head, thường lấy từ cùng nguồn với tiêu đề và mô tả meta. Kiểm tra bằng công cụ xem trước liên kết trước khi chia sẻ.",
  },
  "hreflang-invalid": {
    title: "Giá trị hreflang không hợp lệ hoặc bị lặp",
    explanation:
      "Trang khai báo hreflang nhưng có ít nhất một giá trị không phải mã ngôn ngữ hoặc ngôn ngữ-vùng hợp lệ (ví dụ 'en-uk' thay vì 'en-gb'), hoặc cùng một giá trị được khai báo hai lần. Công cụ tìm kiếm bỏ qua hreflang không hợp lệ.",
    howToFix:
      "Dùng mã ngôn ngữ ISO 639-1 kèm vùng ISO 3166-1 tùy chọn (en, en-gb, vi-vn) hoặc x-default, và mỗi giá trị chỉ khai báo một lần trên mỗi trang.",
  },
  "hreflang-missing-x-default": {
    title: "Hreflang thiếu x-default",
    explanation:
      "Trang liệt kê các bản hreflang nhưng không có mục x-default, nên người tìm kiếm có ngôn ngữ không nằm trong danh sách sẽ không có phiên bản dự phòng được khai báo.",
    howToFix:
      'Thêm <link rel="alternate" hreflang="x-default" href="..."> trỏ tới phiên bản dành cho mọi người còn lại (thường là trang chọn ngôn ngữ hoặc ngôn ngữ chính).',
  },
  "missing-viewport": {
    title: "Thiếu thẻ meta viewport",
    explanation:
      'Trang không có thẻ <meta name="viewport">. Trình duyệt di động sẽ hiển thị ở chiều rộng máy tính rồi thu nhỏ, làm giảm trải nghiệm và ảnh hưởng đến lập chỉ mục ưu tiên thiết bị di động.',
    howToFix:
      'Thêm <meta name="viewport" content="width=device-width, initial-scale=1"> vào phần head của trang.',
  },
  "missing-html-lang": {
    title: "Thiếu thuộc tính lang của thẻ html",
    explanation:
      "Thẻ <html> không có thuộc tính lang. Trình đọc màn hình và công cụ dịch phải đoán ngôn ngữ, và công cụ tìm kiếm mất một tín hiệu về ngôn ngữ của trang.",
    howToFix:
      'Khai báo ngôn ngữ ở thẻ gốc, ví dụ <html lang="vi"> hoặc <html lang="en">.',
  },
  "mixed-content": {
    title: "Nội dung hỗn hợp trên trang HTTPS",
    explanation:
      "Trang HTTPS tải ảnh, script, CSS hoặc khung qua http:// thuần. Trình duyệt sẽ chặn hoặc cảnh báo, có thể làm hỏng trang và mất biểu tượng ổ khóa an toàn.",
    howToFix:
      "Đổi mọi URL tài nguyên từ http:// sang https:// và đảm bảo máy chủ phục vụ tệp đó qua HTTPS.",
  },
  "invalid-json-ld": {
    title: "Dữ liệu có cấu trúc (JSON-LD) bị lỗi cú pháp",
    explanation:
      "Ít nhất một khối application/ld+json không phải JSON hợp lệ, nên công cụ tìm kiếm bỏ qua và trang mất khả năng hiển thị kết quả nâng cao.",
    howToFix:
      "Sửa cú pháp JSON (dấu nháy, dấu phẩy thừa, ngoặc) và kiểm tra khối đó bằng công cụ kiểm thử dữ liệu có cấu trúc.",
  },
  "missing-twitter-card": {
    title: "Thiếu thẻ Twitter Card",
    explanation:
      "Trang không có thẻ meta twitter:card. X (Twitter) dùng lại thẻ Open Graph, nhưng thiếu twitter:card thì liên kết chia sẻ thường chỉ hiện bản xem trước nhỏ và đơn giản.",
    howToFix:
      'Thêm <meta name="twitter:card" content="summary_large_image"> (hoặc summary) vào phần head.',
  },
  "large-html": {
    title: "Tài liệu HTML quá lớn",
    explanation:
      "Riêng HTML (không tính ảnh) đã vượt 500 KB. Tài liệu lớn tải và phân tích chậm hơn, nhất là trên mạng di động, và có thể bị trình thu thập cắt bớt.",
    howToFix:
      "Bỏ dữ liệu nhúng và phần markup lặp lại, chia trang cho danh sách dài, và tải phần nặng khi cần.",
  },
  "broken-external-link": {
    title: "Liên kết tới trang ngoài bị hỏng",
    explanation:
      "Trang liên kết tới một website khác có URL trả về 404 hoặc 410. Người xem gặp ngõ cụt và trang trông kém được chăm sóc.",
    howToFix:
      "Cập nhật liên kết sang địa chỉ mới, thay bằng nguồn còn hoạt động hoặc xoá liên kết.",
  },
} as const satisfies Record<AuditIssueType, IssueCopy>;

export function getAuditIssueCopy(issueType: string): IssueCopy {
  const copies: Partial<Record<string, IssueCopy>> = ISSUE_COPY;
  const localized = copies[issueType];
  if (localized) return localized;
  const descriptor = getIssueDescriptor(issueType);
  return {
    title: descriptor?.title ?? issueType,
    explanation: descriptor?.explanation ?? "",
    howToFix: descriptor?.howToFix ?? "",
  };
}

/** Visible Vietnamese title for dashboards and lists; falls back to the id. */
export function getAuditIssueTitle(issueType: string): string {
  return getAuditIssueCopy(issueType).title;
}
