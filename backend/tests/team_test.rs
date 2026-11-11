use serde_json::json;

#[test]
fn test_default_number_gap_filling() {
    // Giả lập logic kiểm tra tính toán slot số nhỏ nhất
    let names = vec!["Đội 1".to_string(), "Đội 2".to_string(), "Đội 4".to_string()];
    let mut used = std::collections::HashSet::new();

    for name in &names {
        if let Some(num_str) = name.strip_prefix("Đội ") {
            if let Ok(num) = num_str.trim().parse::<usize>() {
                used.insert(num);
            }
        }
    }

    let mut candidate = 1;
    while used.contains(&candidate) {
        candidate += 1;
    }

    assert_eq!(candidate, 3, "Số khuyết phải là 3 (Đội 3)");
}

#[test]
fn test_custom_name_does_not_affect_default_number() {
    let names = vec![
        "Đội 1".to_string(),
        "Rồng Vàng".to_string(),
        "Hổ Cáp".to_string(),
    ];
    let mut used = std::collections::HashSet::new();

    for name in &names {
        if let Some(num_str) = name.strip_prefix("Đội ") {
            if let Ok(num) = num_str.trim().parse::<usize>() {
                used.insert(num);
            }
        }
    }

    let mut candidate = 1;
    while used.contains(&candidate) {
        candidate += 1;
    }

    assert_eq!(candidate, 2, "Tên tùy chỉnh không được cản trở sinh Đội 2");
}

#[test]
fn test_json_payload_serialization() {
    let payload = json!({
        "id": "team_123",
        "name": "Đội 1",
        "member1": "Nguyễn Văn A",
        "member2": "Trần Thị B",
        "customName": false,
        "createdAt": 1731339600000i64,
        "updatedAt": 1731339600000i64
    });

    assert_eq!(payload["customName"], false);
    assert_eq!(payload["name"], "Đội 1");
}
