package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.navigation.fragment.findNavController
import com.example.myapplication.adapter.CommunityAdapter
import com.example.myapplication.databinding.FragmentCommunityBinding

class CommunityFragment : Fragment() {
    private var _binding: FragmentCommunityBinding? = null
    private val binding get() = _binding!!
    private val adapter = CommunityAdapter { index ->
        val bundle = androidx.core.os.bundleOf("index" to index)
        findNavController().navigate(R.id.communityDetailFragment, bundle)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCommunityBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.communityList.layoutManager = LinearLayoutManager(requireContext())
        binding.communityList.adapter = adapter
        adapter.submitList(SampleData.communityPosts)

        binding.fabWrite.setOnClickListener {
            findNavController().navigate(R.id.communityWriteFragment)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

