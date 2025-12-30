package com.example.myapplication.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.myapplication.MessageItem
import com.example.myapplication.Sender
import com.example.myapplication.databinding.ItemChatMeBinding
import com.example.myapplication.databinding.ItemChatOtherBinding

class ChatAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val items = mutableListOf<MessageItem>()

    fun submitList(list: List<MessageItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return when (items[position].from) {
            Sender.ME -> 0
            Sender.AI, Sender.OTHER -> 1
        }
    }

    inner class MeViewHolder(private val binding: ItemChatMeBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: MessageItem) = with(binding) {
            text.text = item.text
            time.text = item.time
        }
    }

    inner class OtherViewHolder(private val binding: ItemChatOtherBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: MessageItem) = with(binding) {
            text.text = item.text
            time.text = item.time
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return if (viewType == 0) {
            val binding = ItemChatMeBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            MeViewHolder(binding)
        } else {
            val binding = ItemChatOtherBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            OtherViewHolder(binding)
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = items[position]
        if (holder is MeViewHolder) holder.bind(item) else if (holder is OtherViewHolder) holder.bind(item)
    }

    override fun getItemCount(): Int = items.size
}


