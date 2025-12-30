package com.example.myapplication.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.myapplication.CommunityPostItem
import com.example.myapplication.databinding.ItemCommunityBinding
import android.widget.LinearLayout

class CommunityAdapter(
    private val onClick: (Int) -> Unit
) : RecyclerView.Adapter<CommunityAdapter.CommunityViewHolder>() {

    private val items = mutableListOf<CommunityPostItem>()

    fun submitList(list: List<CommunityPostItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    inner class CommunityViewHolder(private val binding: ItemCommunityBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: CommunityPostItem) = with(binding) {
            title.text = item.title
            content.text = item.content
            user.text = item.user
            time.text = item.time
            likes.text = item.likes.toString()
            comments.text = item.comments.size.toString()
            if (item.voteTitle != null && item.leftLabel != null && item.rightLabel != null) {
                voteTitle.text = item.voteTitle
                voteLeft.text = item.leftLabel
                voteRight.text = item.rightLabel
                val left = item.leftPct ?: 0
                val right = item.rightPct ?: 0

                val leftParams = voteLeftBar.layoutParams as LinearLayout.LayoutParams
                val rightParams = voteRightBar.layoutParams as LinearLayout.LayoutParams
                leftParams.weight = left.coerceAtLeast(0).toFloat()
                rightParams.weight = right.coerceAtLeast(0).toFloat()
                voteLeftBar.layoutParams = leftParams
                voteRightBar.layoutParams = rightParams

                voteSection.visibility = android.view.View.VISIBLE
                voteLeftPct.text = "$left%"
                voteRightPct.text = "$right%"
            } else {
                voteSection.visibility = android.view.View.GONE
            }
            root.setOnClickListener { onClick(bindingAdapterPosition) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CommunityViewHolder {
        val binding = ItemCommunityBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return CommunityViewHolder(binding)
    }

    override fun onBindViewHolder(holder: CommunityViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size
}

