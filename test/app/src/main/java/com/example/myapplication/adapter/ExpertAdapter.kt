package com.example.myapplication.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.myapplication.ExpertItem
import com.example.myapplication.databinding.ItemExpertBinding

class ExpertAdapter(
    private val onChat: (Int) -> Unit
) : RecyclerView.Adapter<ExpertAdapter.ExpertViewHolder>() {

    private val items = mutableListOf<ExpertItem>()

    fun submitList(list: List<ExpertItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    inner class ExpertViewHolder(private val binding: ItemExpertBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: ExpertItem) = with(binding) {
            name.text = "${item.name} 변호사"
            tag.text = item.category
            desc.text = item.desc
            // 이미지 로더 없이 기본 아이콘 유지
            chatButton.setOnClickListener { onChat(bindingAdapterPosition) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ExpertViewHolder {
        val binding = ItemExpertBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ExpertViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ExpertViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size
}

