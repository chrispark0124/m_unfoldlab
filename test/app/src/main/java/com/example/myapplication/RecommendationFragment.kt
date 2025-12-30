package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.myapplication.adapter.ExpertAdapter
import com.example.myapplication.databinding.FragmentRecommendationBinding

class RecommendationFragment : Fragment() {
    private var _binding: FragmentRecommendationBinding? = null
    private val binding get() = _binding!!
    private val adapter = ExpertAdapter { index ->
        val bundle = androidx.core.os.bundleOf("title" to "${SampleData.experts[index].name} 변호사")
        findNavController().navigate(R.id.chatFragment, bundle)
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRecommendationBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.recommendList.layoutManager = LinearLayoutManager(requireContext())
        binding.recommendList.adapter = adapter
        adapter.submitList(SampleData.experts)

        binding.btnRecClose.setOnClickListener {
            findNavController().popBackStack()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

