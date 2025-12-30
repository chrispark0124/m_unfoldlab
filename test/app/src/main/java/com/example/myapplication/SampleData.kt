package com.example.myapplication

object SampleData {
    val experts = listOf(
        ExpertItem(
            name = "김철수",
            category = "형사",
            tag = "경제범죄, 형사소송",
            desc = "금융·형사 사건 12년 경력, 신속 대응",
            imageUrl = "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80"
        ),
        ExpertItem(
            name = "박영희",
            category = "이혼",
            tag = "가사, 조정",
            desc = "가사 전문, 조정/중재 다수 경험",
            imageUrl = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80"
        ),
        ExpertItem(
            name = "최민수",
            category = "부동산",
            tag = "부동산, 전세사기",
            desc = "부동산 분쟁/전세 사기 특화 상담",
            imageUrl = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80"
        )
    )

    val communityPosts = listOf(
        CommunityPostItem(
            user = "익명123",
            time = "10분 전",
            title = "전세 보증금 안 돌려주는데 이거 신고 가능한가요?",
            content = "계약 만료 3개월 전부터 말했는데 집주인이 연락을 피해요... 내용증명 보내면 해결되나요?",
            likes = 12,
            voteTitle = "내용증명 보낼까요?",
            leftLabel = "보낸다",
            rightLabel = "기다린다",
            leftPct = 80,
            rightPct = 20,
            comments = listOf(
                CommentItem("법률도우미", "5분 전", "내용증명부터 보내 보시는 게 좋습니다."),
                CommentItem("익명456", "방금 전", "저도 비슷한 상황인데 내용증명 후에 바로 연락 오더라고요.")
            )
        ),
        CommunityPostItem(
            user = "고민많은직장인",
            time = "1시간 전",
            title = "중고거래 사기 당한 것 같습니다 ㅠㅠ",
            content = "입금했는데 물건도 안 보내고 잠수 탔어요. 소액인데 경찰서 가면 받아주나요?",
            likes = 45,
            voteTitle = "신고 가능?",
            leftLabel = "가능",
            rightLabel = "힘듦",
            leftPct = 95,
            rightPct = 5,
            comments = listOf(
                CommentItem("형사전문", "45분 전", "캡처 정리해서 사이버수사대에 신고해 보세요.")
            )
        ),
        CommunityPostItem(
            user = "법알못",
            time = "3시간 전",
            title = "층간소음 때문에 윗집이랑 싸웠는데 고소 당할까요?",
            content = "너무 시끄러워서 올라가서 문 좀 세게 두드렸는데, 주거침입으로 신고한다고 하네요...",
            likes = 8,
            voteTitle = "누가 잘못?",
            leftLabel = "윗집",
            rightLabel = "글쓴이",
            leftPct = 60,
            rightPct = 40,
            comments = emptyList()
        )
    )

    val evidences = listOf(
        EvidenceItem("임대차계약서.pdf", "2023.09.20"),
        EvidenceItem("카톡_대화내용.png", "2023.10.02"),
        EvidenceItem("통화녹음.m4a", "2023.10.18")
    )

    val aiMessages = listOf(
        MessageItem(Sender.OTHER, "안녕하세요! 무엇을 도와드릴까요?", "오전 10:12"),
        MessageItem(Sender.ME, "계약서 특약이 위험한지 궁금해요.", "오전 10:13"),
        MessageItem(Sender.AI, "확인해 보니 '원상복구' 조항이 모호합니다. 수정 권장해요.", "오전 10:14")
    )
}

