package com.example.myapplication

data class ExpertItem(
    val name: String,
    val category: String,
    val tag: String,
    val desc: String,
    val imageUrl: String
)

data class CommunityPostItem(
    val user: String,
    val time: String,
    val title: String,
    val content: String,
    val likes: Int,
    val voteTitle: String? = null,
    val leftLabel: String? = null,
    val rightLabel: String? = null,
    val leftPct: Int? = null,
    val rightPct: Int? = null,
    val comments: List<CommentItem> = emptyList()
)

data class CommentItem(
    val user: String,
    val time: String,
    val text: String
)

data class EvidenceItem(
    val name: String,
    val date: String,
    val type: String = "file"
)

data class MessageItem(
    val from: Sender,
    val text: String,
    val time: String
)

enum class Sender { ME, OTHER, AI }

