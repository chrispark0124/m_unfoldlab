package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.core.os.bundleOf
import androidx.navigation.fragment.findNavController
import com.example.myapplication.adapter.ExpertAdapter
import com.example.myapplication.databinding.FragmentExpertBinding

class ExpertFragment : Fragment() {
    private var _binding: FragmentExpertBinding? = null
    private val binding get() = _binding!!
    private val adapter = ExpertAdapter { index ->
        val bundle = bundleOf("title" to "${SampleData.experts[index].name} 변호사")
        findNavController().navigate(R.id.chatFragment, bundle)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentExpertBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.expertList.layoutManager = LinearLayoutManager(requireContext())
        binding.expertList.adapter = adapter
        adapter.submitList(SampleData.experts)

        binding.chipGroup.setOnCheckedStateChangeListener { group, _ ->
            val filtered = when (group.checkedChipId) {
                binding.chipCriminal.id -> SampleData.experts.filter { it.category == "형사" }
                binding.chipDivorce.id -> SampleData.experts.filter { it.category == "이혼" }
                binding.chipRealestate.id -> SampleData.experts.filter { it.category == "부동산" }
                else -> SampleData.experts
            }
            adapter.submitList(filtered)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

