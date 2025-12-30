package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import android.widget.LinearLayout
import com.example.myapplication.adapter.CommentAdapter
import com.example.myapplication.databinding.FragmentCommunityDetailBinding

class CommunityDetailFragment : Fragment() {
    private var _binding: FragmentCommunityDetailBinding? = null
    private val binding get() = _binding!!
    private val commentAdapter = CommentAdapter()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCommunityDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val index = arguments?.getInt("index") ?: 0
        val post = SampleData.communityPosts.getOrNull(index)
        binding.btnBackDetail.setOnClickListener { findNavController().popBackStack() }

        if (post != null) {
            binding.detailUser.text = post.user
            binding.detailTime.text = post.time
            binding.detailTitle.text = post.title
            binding.detailContent.text = post.content
            if (post.voteTitle != null && post.leftLabel != null && post.rightLabel != null) {
                binding.detailVoteArea.visibility = View.VISIBLE
                binding.detailVoteTitle.text = post.voteTitle
                binding.detailLeftLabel.text = post.leftLabel
                binding.detailRightLabel.text = post.rightLabel
                val left = post.leftPct ?: 0
                val right = post.rightPct ?: 0
                val leftParams = binding.detailLeftBar.layoutParams as LinearLayout.LayoutParams
                val rightParams = binding.detailRightBar.layoutParams as LinearLayout.LayoutParams
                leftParams.weight = left.toFloat()
                rightParams.weight = right.toFloat()
                binding.detailLeftBar.layoutParams = leftParams
                binding.detailRightBar.layoutParams = rightParams
                binding.detailLeftPct.text = "$left%"
                binding.detailRightPct.text = "$right%"
            }
            binding.detailCommentCount.text = "댓글 ${post.comments.size}개"
            binding.detailCommentList.layoutManager = LinearLayoutManager(requireContext())
            binding.detailCommentList.adapter = commentAdapter
            commentAdapter.submitList(post.comments)
        }

        binding.btnCommentSubmit.setOnClickListener {
            binding.inputComment.setText("")
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

