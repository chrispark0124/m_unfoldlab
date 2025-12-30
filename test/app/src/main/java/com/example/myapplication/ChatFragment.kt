package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.myapplication.adapter.ChatAdapter
import com.example.myapplication.databinding.FragmentChatBinding
import com.example.myapplication.MessageItem
import com.example.myapplication.Sender

class ChatFragment : Fragment() {
    private var _binding: FragmentChatBinding? = null
    private val binding get() = _binding!!
    private val adapter = ChatAdapter()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentChatBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val title = arguments?.getString("title") ?: "채팅"
        binding.chatTitle.text = title
        binding.chatList.layoutManager = LinearLayoutManager(requireContext()).apply {
            stackFromEnd = true
        }
        binding.chatList.adapter = adapter
        adapter.submitList(SampleData.aiMessages)

        binding.btnChatBack.setOnClickListener { findNavController().popBackStack() }
        binding.btnChatSend.setOnClickListener {
            val text = binding.inputChat.text.toString().trim()
            if (text.isNotEmpty()) {
                val newList = SampleData.aiMessages.toMutableList()
                newList.add(MessageItem(Sender.ME, text, "지금"))
                adapter.submitList(newList)
                binding.inputChat.setText("")
                binding.chatList.scrollToPosition(newList.size - 1)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

